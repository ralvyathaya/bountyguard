import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import {
  accessToken,
  captureOrder,
  createOrder,
  createPayout,
  getPayout,
  PayPalError,
  sandboxBaseUrl,
  verifyCapture,
  getVerifiedCapture,
  verifyWebhookSignature,
} from "../lib/paypal";

const originalFetch = globalThis.fetch;
beforeEach(() => {
  process.env.PAYPAL_CLIENT_ID = `test-${randomUUID()}`;
  process.env.PAYPAL_CLIENT_SECRET = "test-secret";
  process.env.PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const payout = {
  bountyId: "bounty-1",
  receiverEmail: "dev@example.test",
  amountCents: 3500,
  senderBatchId: "stable-batch-key",
};
const capture = () => ({
  id: "ORDER1",
  status: "COMPLETED",
  purchase_units: [
    {
      reference_id: "bounty-1",
      custom_id: "bounty-1",
      payments: {
        captures: [
          {
            id: "CAPTURE1",
            status: "COMPLETED",
            final_capture: true,
            amount: { currency_code: "USD", value: "35.00" },
          },
        ],
      },
    },
  ],
});
const expected = { orderId: "ORDER1", bountyId: "bounty-1", amountCents: 3500 };
function mockPayPal(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  globalThis.fetch = async (input, init) =>
    String(input).endsWith("/v1/oauth2/token")
      ? Response.json({ access_token: "sandbox-token", expires_in: 300 })
      : handler(String(input), init);
}

test("PayPal rejects live hosts before any network request", async () => {
  process.env.PAYPAL_BASE_URL = "https://api-m.paypal.com";
  assert.throws(sandboxBaseUrl, /only permits/);
  await assert.rejects(
    createOrder("bounty-1", 3500, "stable-key"),
    /only permits/,
  );
});
test("OAuth uses client_credentials and caches unexpired tokens", async () => {
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    assert.equal(init?.body, "grant_type=client_credentials");
    assert.ok(
      new Headers(init?.headers).get("Authorization")?.startsWith("Basic "),
    );
    return Response.json({ access_token: "cached-token", expires_in: 300 });
  };
  assert.equal(await accessToken(), "cached-token");
  assert.equal(await accessToken(), "cached-token");
  assert.equal(calls, 1);
});
test("order creation sends server USD amount, bounty binding and stable request ID", async () => {
  mockPayPal((_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.purchase_units[0].amount.value, "35.00");
    assert.equal(body.purchase_units[0].custom_id, "bounty-1");
    assert.equal(
      new Headers(init?.headers).get("PayPal-Request-Id"),
      "stable-order-key",
    );
    return Response.json({ id: "ORDER1" });
  });
  assert.deepEqual(await createOrder("bounty-1", 3500, "stable-order-key"), {
    orderId: "ORDER1",
  });
});
test("capture verification rejects amount, currency, bounty, order, and status mismatches", () => {
  assert.equal(verifyCapture(capture(), expected).captureId, "CAPTURE1");
  assert.throws(
    () => verifyCapture(capture(), { ...expected, amountCents: 3501 }),
    /verification failed/,
  );
  assert.throws(
    () => verifyCapture(capture(), { ...expected, bountyId: "other" }),
    /verification failed/,
  );
  assert.throws(
    () => verifyCapture(capture(), { ...expected, orderId: "OTHER" }),
    /verification failed/,
  );
  const wrongCurrency = capture();
  wrongCurrency.purchase_units[0].payments.captures[0].amount.currency_code =
    "EUR";
  assert.throws(
    () => verifyCapture(wrongCurrency, expected),
    /verification failed/,
  );
  const pending = capture();
  pending.purchase_units[0].payments.captures[0].status = "PENDING";
  assert.throws(() => verifyCapture(pending, expected), /verification failed/);
});
test("already-captured orders are retrieved and verified rather than funded twice", async () => {
  let captures = 0;
  mockPayPal((url) => {
    if (url.endsWith("/capture")) {
      captures++;
      return Response.json({ name: "UNPROCESSABLE_ENTITY" }, { status: 422 });
    }
    return Response.json(capture());
  });
  assert.equal(
    (await captureOrder("ORDER1", "stable-capture", expected)).captureId,
    "CAPTURE1",
  );
  assert.equal(captures, 1);
});
test("only a recognized Payouts permission denial creates a simulation receipt", async () => {
  mockPayPal(() => Response.json({ name: "NOT_AUTHORIZED" }, { status: 403 }));
  const result = await createPayout(payout);
  assert.equal(result.provider, "SIMULATION");
  assert.equal(result.status, "SIMULATED");
  assert.match(result.transactionId!, /^SIM-/);
  assert.match(result.error!, /funds remain reserved/);
  mockPayPal(() =>
    Response.json({ name: "INSUFFICIENT_FUNDS" }, { status: 422 }),
  );
  await assert.rejects(createPayout(payout), PayPalError);
  mockPayPal(() =>
    Response.json({ name: "UNRECOGNIZED_ERROR" }, { status: 403 }),
  );
  await assert.rejects(createPayout(payout), PayPalError);
});
test("a created batch stays pending until the verified payout item succeeds", async () => {
  mockPayPal(() =>
    Response.json({
      batch_header: { payout_batch_id: "BATCH1", batch_status: "SUCCESS" },
    }),
  );
  const created = await createPayout(payout);
  assert.equal(created.status, "PENDING");
  assert.equal(created.transactionId, null);
  mockPayPal(() =>
    Response.json({
      batch_header: {
        payout_batch_id: "BATCH1",
        batch_status: "SUCCESS",
        sender_batch_header: { sender_batch_id: payout.senderBatchId },
      },
      items: [
        {
          transaction_status: "SUCCESS",
          transaction_id: "TX1",
          payout_item: {
            receiver: payout.receiverEmail,
            amount: { currency: "USD", value: "35.00" },
          },
        },
      ],
    }),
  );
  const settled = await getPayout("BATCH1", payout);
  assert.equal(settled.status, "SUCCESS");
  assert.equal(settled.transactionId, "TX1");
  await assert.rejects(
    getPayout("BATCH1", { ...payout, receiverEmail: "changed@example.test" }),
    /VERIFICATION_FAILED/,
  );
});
test("retry after a provider failure reuses the same sender_batch_id", async () => {
  const keys: string[] = [];
  let attempts = 0;
  mockPayPal((_url, init) => {
    const body = JSON.parse(String(init?.body));
    keys.push(body.sender_batch_header.sender_batch_id);
    attempts++;
    return attempts === 1
      ? Response.json({ name: "INTERNAL_SERVER_ERROR" }, { status: 500 })
      : Response.json({ batch_header: { payout_batch_id: "BATCH1" } });
  });
  await assert.rejects(createPayout(payout), PayPalError);
  await createPayout(payout);
  assert.deepEqual(keys, [payout.senderBatchId, payout.senderBatchId]);
});
test("ambiguous network failures never become simulated or successful payments", async () => {
  mockPayPal(() => {
    throw new DOMException("Timeout", "TimeoutError");
  });
  await assert.rejects(createPayout(payout), /response is unknown/);
});

test("funding reconciliation only reads provider objects and rejects a refunded capture", async () => {
  const methods: string[] = [];
  let refunded = false;
  mockPayPal((url, init) => {
    methods.push(init?.method ?? "GET");
    return Response.json(url.includes("/v2/checkout/orders/") ? capture() : {
      id: "CAPTURE1", status: refunded ? "REFUNDED" : "COMPLETED", amount: { currency_code: "USD", value: "35.00" },
    });
  });
  assert.equal((await getVerifiedCapture("ORDER1", expected)).captureId, "CAPTURE1");
  assert.deepEqual(methods, ["GET", "GET"]);
  refunded = true;
  await assert.rejects(getVerifiedCapture("ORDER1", expected), (error: unknown) => error instanceof Error && "code" in error && error.code === "FUNDING_HOLD");
});

test("webhook verification requires signed headers and uses the fixed Sandbox verification API", async () => {
  process.env.PAYPAL_WEBHOOK_ID = "WH-CONFIGURED";
  let calls = 0;
  mockPayPal((url, init) => {
    calls++;
    assert.equal(url, "https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.webhook_id, "WH-CONFIGURED");
    assert.equal(body.webhook_event.id, "EVENT1");
    return Response.json({ verification_status: "SUCCESS" });
  });
  await assert.rejects(verifyWebhookSignature(new Headers(), { id: "EVENT1" }), /signature/i);
  assert.equal(calls, 0);
  const headers = new Headers({ "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT1", "paypal-transmission-id": "T1", "paypal-transmission-sig": "signed", "paypal-transmission-time": new Date().toISOString() });
  await verifyWebhookSignature(headers, { id: "EVENT1" });
  assert.equal(calls, 1);
});

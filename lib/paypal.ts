import { randomUUID } from "node:crypto";
import { AppError, requiredEnv } from "./errors";
import { paypalAmount } from "./policy";

type JsonObject = Record<string, unknown>;
type PayPalLink = { href?: string; rel?: string };
export class PayPalError extends AppError {
  constructor(
    public paypalCode: string,
    public httpStatus: number,
    public originalBatchId?: string,
  ) {
    super(
      502,
      `PayPal Sandbox returned ${paypalCode}. No completed payment has been assumed.`,
      "PAYPAL_ERROR",
    );
  }
}
let cachedToken: { key: string; value: string; expiresAt: number } | undefined;
let pendingToken: { key: string; promise: Promise<string> } | undefined;

export function sandboxBaseUrl() {
  const base =
    process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";
  if (base.replace(/\/$/, "") !== "https://api-m.sandbox.paypal.com")
    throw new AppError(
      503,
      "BountyGuard only permits https://api-m.sandbox.paypal.com.",
      "SANDBOX_ONLY",
    );
  return "https://api-m.sandbox.paypal.com";
}
async function responseJson(response: Response): Promise<JsonObject> {
  try {
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as JsonObject;
  } catch {
    throw new PayPalError("MALFORMED_RESPONSE", response.status);
  }
}
export async function accessToken(): Promise<string> {
  const base = sandboxBaseUrl();
  const clientId = requiredEnv("PAYPAL_CLIENT_ID");
  const clientSecret = requiredEnv("PAYPAL_CLIENT_SECRET");
  const key = `${base}:${clientId}:${clientSecret}`;
  if (cachedToken?.key === key && cachedToken.expiresAt > Date.now())
    return cachedToken.value;
  if (pendingToken?.key === key) return pendingToken.promise;
  const promise = (async () => {
    let response: Response;
    try {
      response = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new AppError(
        502,
        "PayPal authentication is unavailable. Check credentials and connectivity.",
        "PAYPAL_AUTH_FAILED",
      );
    }
    const body = await responseJson(response);
    if (
      !response.ok ||
      typeof body.access_token !== "string" ||
      typeof body.expires_in !== "number" ||
      body.expires_in <= 0
    )
      throw new AppError(
        502,
        "PayPal Sandbox authentication failed. Check sandbox app credentials.",
        "PAYPAL_AUTH_FAILED",
      );
    cachedToken = {
      key,
      value: body.access_token,
      expiresAt: Date.now() + Math.max(0, body.expires_in - 60) * 1000,
    };
    return body.access_token;
  })();
  pendingToken = { key, promise };
  try {
    return await promise;
  } finally {
    if (pendingToken?.promise === promise) pendingToken = undefined;
  }
}

async function request(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown; requestId?: string } = {},
  refreshed = false,
): Promise<JsonObject> {
  const token = await accessToken();
  let response: Response;
  try {
    response = await fetch(`${sandboxBaseUrl()}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(options.requestId
          ? { "PayPal-Request-Id": options.requestId }
          : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new AppError(
      502,
      "PayPal response is unknown. Reconcile this operation before attempting another payment.",
      "PAYPAL_UNKNOWN",
    );
  }
  if (response.status === 401 && !refreshed) {
    cachedToken = undefined;
    return request(path, options, true);
  }
  const body = await responseJson(response);
  if (!response.ok) {
    let originalBatchId: string | undefined;
    if (Array.isArray(body.links)) {
      for (const link of body.links as PayPalLink[]) {
        if (typeof link.href !== "string") continue;
        try {
          const url = new URL(link.href);
          const match = /^\/v1\/payments\/payouts\/([a-zA-Z0-9]+)$/.exec(
            url.pathname,
          );
          if (url.origin === sandboxBaseUrl() && match)
            originalBatchId = match[1];
        } catch {
          /* Provider links are untrusted until their sandbox origin is checked. */
        }
      }
    }
    const code =
      typeof body.name === "string" && /^[A-Z0-9_]+$/.test(body.name)
        ? body.name
        : `HTTP_${response.status}`;
    throw new PayPalError(code, response.status, originalBatchId);
  }
  return body;
}

export async function createOrder(
  bountyId: string,
  amountCents: number,
  requestId: string,
) {
  const body = await request("/v2/checkout/orders", {
    method: "POST",
    requestId,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: bountyId,
          custom_id: bountyId,
          amount: { currency_code: "USD", value: paypalAmount(amountCents) },
        },
      ],
      application_context: { shipping_preference: "NO_SHIPPING" },
    },
  });
  if (typeof body.id !== "string" || !/^[a-zA-Z0-9]+$/.test(body.id))
    throw new PayPalError("INVALID_ORDER_RESPONSE", 502);
  return { orderId: body.id };
}

type Capture = {
  id?: string;
  status?: string;
  amount?: { currency_code?: string; value?: string };
  final_capture?: boolean;
};
export function verifyCapture(
  body: JsonObject,
  expected: { orderId: string; bountyId: string; amountCents: number },
) {
  const units = body.purchase_units as
    | {
        reference_id?: string;
        custom_id?: string;
        payments?: { captures?: Capture[] };
      }[]
    | undefined;
  const capture = units?.[0]?.payments?.captures?.[0];
  if (
    body.id !== expected.orderId ||
    body.status !== "COMPLETED" ||
    !Array.isArray(units) ||
    units.length !== 1 ||
    units[0].custom_id !== expected.bountyId ||
    units[0].reference_id !== expected.bountyId ||
    units[0].payments?.captures?.length !== 1 ||
    capture?.status !== "COMPLETED" ||
    !capture.id ||
    capture.final_capture === false ||
    capture.amount?.currency_code !== "USD" ||
    capture.amount.value !== paypalAmount(expected.amountCents)
  ) {
    throw new AppError(
      409,
      "Capture verification failed: order, bounty, amount, currency, or completion status did not match.",
      "CAPTURE_MISMATCH",
    );
  }
  return {
    captureId: capture.id,
    receipt: {
      orderId: body.id,
      captureId: capture.id,
      status: capture.status,
      amount: capture.amount,
    },
  };
}
export async function captureOrder(
  orderId: string,
  requestId: string,
  expected: { bountyId: string; amountCents: number },
) {
  let body: JsonObject;
  try {
    body = await request(
      `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      { method: "POST", body: {}, requestId },
    );
  } catch (error) {
    if (
      !(error instanceof PayPalError) ||
      !["UNPROCESSABLE_ENTITY", "ORDER_ALREADY_CAPTURED"].includes(
        error.paypalCode,
      )
    )
      throw error;
    body = await request(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  }
  return verifyCapture(body, { ...expected, orderId });
}

export async function getOrder(orderId: string) {
  return request(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

export async function getCapture(captureId: string) {
  return request(`/v2/payments/captures/${encodeURIComponent(captureId)}`);
}

export async function getVerifiedCapture(
  orderId: string,
  expected: { bountyId: string; amountCents: number; captureId?: string | null },
) {
  const verified = verifyCapture(await getOrder(orderId), { ...expected, orderId });
  if (expected.captureId && verified.captureId !== expected.captureId)
    throw new AppError(409, "The funding capture changed. Inspect funding before releasing rewards.", "FUNDING_HOLD");
  const capture = await getCapture(verified.captureId);
  const amount = capture.amount as { currency_code?: string; value?: string } | undefined;
  if (capture.id !== verified.captureId || capture.status !== "COMPLETED" || amount?.currency_code !== "USD" || amount.value !== paypalAmount(expected.amountCents))
    throw new AppError(409, "Funding is no longer a completed matching USD capture. Reward release is on hold.", "FUNDING_HOLD");
  return verified;
}

export async function verifyWebhookSignature(headers: Headers, webhookEvent: unknown) {
  const webhookId = requiredEnv("PAYPAL_WEBHOOK_ID");
  const authAlgo = headers.get("paypal-auth-algo");
  const certUrl = headers.get("paypal-cert-url");
  const transmissionId = headers.get("paypal-transmission-id");
  const transmissionSig = headers.get("paypal-transmission-sig");
  const transmissionTime = headers.get("paypal-transmission-time");
  let certificateAllowed = false;
  try {
    const url = new URL(certUrl ?? "");
    certificateAllowed = url.protocol === "https:" && ["api.paypal.com", "api.sandbox.paypal.com", "api-m.sandbox.paypal.com"].includes(url.hostname) && /^\/v1\/notifications\/certs\/[a-zA-Z0-9_-]+$/.test(url.pathname) && !url.search && !url.hash && !url.username && !url.password;
  } catch { /* Invalid certificate locations never reach the verification service. */ }
  if (authAlgo !== "SHA256withRSA" || !certificateAllowed || !transmissionId || transmissionId.length > 200 || !transmissionSig || transmissionSig.length > 4096 || !transmissionTime || !Number.isFinite(Date.parse(transmissionTime)))
    throw new AppError(401, "PayPal webhook signature headers are missing or invalid.", "INVALID_WEBHOOK_SIGNATURE");
  const result = await request("/v1/notifications/verify-webhook-signature", { method: "POST", body: {
    auth_algo: authAlgo, cert_url: certUrl, transmission_id: transmissionId,
    transmission_sig: transmissionSig, transmission_time: transmissionTime,
    webhook_id: webhookId, webhook_event: webhookEvent,
  } });
  if (result.verification_status !== "SUCCESS")
    throw new AppError(401, "PayPal webhook signature verification failed.", "INVALID_WEBHOOK_SIGNATURE");
}

export function payoutPermissionDenied(error: unknown) {
  return (
    error instanceof PayPalError &&
    error.httpStatus === 403 &&
    [
      "NOT_AUTHORIZED",
      "AUTHORIZATION_ERROR",
      "PERMISSION_DENIED",
      "INSUFFICIENT_PERMISSIONS",
    ].includes(error.paypalCode)
  );
}
export type PayoutResult = {
  batchId: string | null;
  transactionId: string | null;
  status: string;
  provider: string;
  receipt: JsonObject;
  error?: string;
};
export async function createPayout(input: {
  bountyId: string;
  receiverEmail: string;
  amountCents: number;
  senderBatchId: string;
}): Promise<PayoutResult> {
  try {
    const body = await request("/v1/payments/payouts", {
      method: "POST",
      requestId: input.senderBatchId,
      body: {
        sender_batch_header: {
          sender_batch_id: input.senderBatchId,
          email_subject: "BountyGuard milestone approved",
        },
        items: [
          {
            recipient_type: "EMAIL",
            receiver: input.receiverEmail,
            amount: { currency: "USD", value: paypalAmount(input.amountCents) },
            sender_item_id: input.bountyId,
            note: `BountyGuard bounty ${input.bountyId}`,
          },
        ],
      },
    });
    const header = body.batch_header as
      | { payout_batch_id?: string }
      | undefined;
    if (!header?.payout_batch_id)
      throw new PayPalError("INVALID_PAYOUT_RESPONSE", 502);
    return {
      batchId: header.payout_batch_id,
      transactionId: null,
      status: "PENDING",
      provider: "PAYPAL_SANDBOX",
      receipt: {
        batchId: header.payout_batch_id,
        status: "PENDING",
        senderBatchId: input.senderBatchId,
      },
    };
  } catch (error) {
    if (error instanceof PayPalError && error.originalBatchId)
      return getPayout(error.originalBatchId, input);
    if (!payoutPermissionDenied(error)) throw error;
    return {
      batchId: null,
      transactionId: `SIM-${randomUUID()}`,
      status: "SIMULATED",
      provider: "SIMULATION",
      error:
        "Sandbox account lacks Payouts permission. This receipt is a simulation; captured funds remain reserved.",
      receipt: {
        simulated: true,
        reason: "PAYOUT_PERMISSION_DENIED",
        amount: paypalAmount(input.amountCents),
        currency: "USD",
        receiver: input.receiverEmail,
        senderBatchId: input.senderBatchId,
        createdAt: new Date().toISOString(),
      },
    };
  }
}
export async function getPayout(
  batchId: string,
  expected: {
    receiverEmail: string;
    amountCents: number;
    senderBatchId: string;
  },
): Promise<PayoutResult> {
  const body = await request(
    `/v1/payments/payouts/${encodeURIComponent(batchId)}?page_size=100`,
  );
  const header = body.batch_header as
    | {
        payout_batch_id?: string;
        sender_batch_header?: { sender_batch_id?: string };
        batch_status?: string;
      }
    | undefined;
  const items = body.items as
    | {
        transaction_status?: string;
        transaction_id?: string;
        payout_item?: {
          receiver?: string;
          amount?: { value?: string; currency?: string };
          sender_item_id?: string;
        };
      }[]
    | undefined;
  if (
    header?.payout_batch_id !== batchId ||
    header.sender_batch_header?.sender_batch_id !== expected.senderBatchId ||
    !Array.isArray(items) ||
    items.length !== 1
  )
    throw new PayPalError("PAYOUT_VERIFICATION_FAILED", 502);
  const item = items[0];
  if (
    item.payout_item?.receiver !== expected.receiverEmail ||
    item.payout_item.amount?.currency !== "USD" ||
    item.payout_item.amount.value !== paypalAmount(expected.amountCents)
  )
    throw new PayPalError("PAYOUT_VERIFICATION_FAILED", 502);
  const known = [
    "SUCCESS",
    "PENDING",
    "PROCESSING",
    "FAILED",
    "DENIED",
    "UNCLAIMED",
    "RETURNED",
    "REFUNDED",
    "ONHOLD",
    "BLOCKED",
    "CANCELED",
    "REVERSED",
  ];
  const status = known.includes(item.transaction_status ?? "")
    ? item.transaction_status!
    : "UNKNOWN";
  return {
    batchId,
    status,
    transactionId: item.transaction_id ?? null,
    provider: "PAYPAL_SANDBOX",
    receipt: {
      batchId,
      batchStatus: header.batch_status ?? "UNKNOWN",
      itemStatus: status,
      transactionId: item.transaction_id ?? null,
      amount: item.payout_item.amount,
      receiver: item.payout_item.receiver,
    },
  };
}

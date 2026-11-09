import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { fundOrder } from "../lib/bounty-service";

test("a delayed duplicate order response cannot undo completed funding", async () => {
  const previousDb = Reflect.get(globalThis, "bountyguardDb");
  const previousFetch = globalThis.fetch;
  const funding = {
    id: "funding1",
    bountyId: "bounty1",
    amountCents: 3500,
    requestId: randomUUID(),
    captureKey: randomUUID(),
    orderId: null as string | null,
    captureId: null as string | null,
    status: "CREATING",
  };
  const fake = {
    bounty: {
      findUnique: async () => ({
        id: "bounty1",
        rewardCents: 3500,
        funding: { ...funding },
      }),
    },
    funding: {
      update: async ({ data }: { data: Partial<typeof funding> }) =>
        Object.assign(funding, data),
      updateMany: async ({
        where,
        data,
      }: {
        where: { status: string };
        data: Partial<typeof funding>;
      }) => {
        if (funding.status !== where.status) return { count: 0 };
        Object.assign(funding, data);
        return { count: 1 };
      },
    },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(fake),
  };
  Reflect.set(globalThis, "bountyguardDb", fake);
  process.env.PAYPAL_CLIENT_ID = `test-${randomUUID()}`;
  process.env.PAYPAL_CLIENT_SECRET = "test-secret";
  process.env.PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";
  let releaseBoth!: () => void;
  let releaseLate!: () => void;
  const bothStarted = new Promise<void>((resolve) => {
    releaseBoth = resolve;
  });
  const lateResponse = new Promise<void>((resolve) => {
    releaseLate = resolve;
  });
  let orders = 0;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/v1/oauth2/token"))
      return Response.json({ access_token: "test-token", expires_in: 300 });
    orders++;
    if (orders === 1) await bothStarted;
    else {
      releaseBoth();
      await lateResponse;
    }
    return Response.json({ id: "ORDER1" });
  };
  try {
    const first = fundOrder("bounty1");
    const second = fundOrder("bounty1");
    await first;
    funding.status = "COMPLETED";
    funding.captureId = "CAPTURE1";
    releaseLate();
    await second;
    assert.equal(funding.status, "COMPLETED");
    assert.equal(funding.captureId, "CAPTURE1");
    assert.equal(funding.orderId, "ORDER1");
    assert.equal(orders, 2);
  } finally {
    releaseLate();
    releaseBoth();
    Reflect.set(globalThis, "bountyguardDb", previousDb);
    globalThis.fetch = previousFetch;
  }
});

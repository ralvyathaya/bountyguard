import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { handlePayPalWebhook } from "../lib/paypal-webhook";
import { canTransitionPayout } from "../lib/bounty-service";

const originalFetch = globalThis.fetch;
const originalDb = Reflect.get(globalThis, "bountyguardDb");
afterEach(() => { globalThis.fetch = originalFetch; Reflect.set(globalThis, "bountyguardDb", originalDb); });
function request() {
  return new Request("https://bountyguard.example/api/paypal/webhook", { method: "POST", headers: {
    "content-type": "application/json", "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT1", "paypal-transmission-id": "T1", "paypal-transmission-sig": "signed", "paypal-transmission-time": new Date().toISOString(),
  }, body: JSON.stringify({ id: "EVENT1", event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", resource: { payout_batch_id: "BATCH1" } }) });
}
function verification(status: "SUCCESS" | "FAILURE") {
  process.env.PAYPAL_CLIENT_ID = `test-${randomUUID()}`;
  process.env.PAYPAL_CLIENT_SECRET = "test-only";
  process.env.PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";
  process.env.PAYPAL_WEBHOOK_ID = "WH-REGISTERED";
  globalThis.fetch = async input => String(input).endsWith("/v1/oauth2/token") ? Response.json({ access_token: "test-token", expires_in: 300 }) : Response.json({ verification_status: status });
}
test("invalid signatures do not touch the database, without requiring a browser session or Origin", async () => {
  verification("FAILURE");
  let touched = false;
  Reflect.set(globalThis, "bountyguardDb", { providerWebhookEvent: { upsert: () => { touched = true; throw new Error("Must not run"); } } });
  const result = await handlePayPalWebhook(request());
  assert.equal(result.status, 401);
  assert.equal(touched, false);
});
test("a verified duplicate is acknowledged without reconciling or issuing payment", async () => {
  verification("SUCCESS");
  Reflect.set(globalThis, "bountyguardDb", { providerWebhookEvent: { upsert: async () => ({ id: "EVENT1", status: "PROCESSED" }) } });
  const result = await handlePayPalWebhook(request());
  assert.equal(result.status, 200);
  assert.equal((await result.json()).duplicate, true);
});
test("out-of-order pending results cannot overwrite settled or returned money", () => {
  assert.equal(canTransitionPayout("SUCCESS", "PENDING"), false);
  assert.equal(canTransitionPayout("SUCCESS", "RETURNED"), true);
  assert.equal(canTransitionPayout("RETURNED", "SUCCESS"), false);
  assert.equal(canTransitionPayout("REFUNDED", "PENDING"), false);
  assert.equal(canTransitionPayout("PENDING", "SUCCESS"), true);
});

test("capture reconciliation retries transient errors through GETs and duplicate delivery is harmless", async () => {
  verification("SUCCESS");
  const event = { id: "EVENT1", status: "RECEIVED", type: "PAYMENT.CAPTURE.COMPLETED", attempts: 0 };
  const funding = { id: "F1", bountyId: "B1", amountCents: 3500, status: "CREATED", orderId: "ORDER1", captureId: null as string | null, updatedAt: new Date() };
  const ledger: string[] = [];
  const fake = {
    providerWebhookEvent: {
      upsert: async () => ({ ...event }),
      updateMany: async () => { if (event.status === "PROCESSING") return { count: 0 }; event.status = "PROCESSING"; event.attempts++; return { count: 1 }; },
      update: async ({ data }: { data: Partial<typeof event> }) => Object.assign(event, data),
    },
    funding: {
      findFirst: async () => ({ ...funding }), findUnique: async () => ({ ...funding }),
      updateMany: async ({ data }: { data: Partial<typeof funding> }) => { Object.assign(funding, data); return { count: 1 }; },
    },
    ledgerEvent: { create: async ({ data }: { data: { type: string } }) => { ledger.push(data.type); } },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(fake),
  };
  Reflect.set(globalThis, "bountyguardDb", fake);
  const providerReads: string[] = [];
  let failOnce = true;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v1/oauth2/token")) return Response.json({ access_token: "test-token", expires_in: 300 });
    if (url.endsWith("/verify-webhook-signature")) return Response.json({ verification_status: "SUCCESS" });
    assert.equal(init?.method, "GET");
    if (failOnce) { failOnce = false; throw new DOMException("Temporary timeout", "TimeoutError"); }
    providerReads.push(url);
    return Response.json(url.includes("/checkout/orders/") ? { id: "ORDER1", status: "COMPLETED", purchase_units: [{ reference_id: "B1", custom_id: "B1", payments: { captures: [{ id: "CAPTURE1", status: "COMPLETED", amount: { currency_code: "USD", value: "35.00" } }] } }] } : { id: "CAPTURE1", status: "COMPLETED", amount: { currency_code: "USD", value: "35.00" } });
  };
  const captureRequest = () => { const req = request(); return new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify({ id: "EVENT1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAPTURE1", supplementary_data: { related_ids: { order_id: "ORDER1" } } } }) }); };
  assert.equal((await handlePayPalWebhook(captureRequest())).status, 503);
  assert.equal(event.status, "FAILED");
  assert.equal(funding.status, "CREATED");
  assert.equal((await handlePayPalWebhook(captureRequest())).status, 200);
  assert.equal(funding.status, "COMPLETED");
  assert.equal(funding.captureId, "CAPTURE1");
  assert.deepEqual(ledger, ["FUNDING_CAPTURED"]);
  assert.equal((await handlePayPalWebhook(captureRequest())).status, 200);
  assert.equal(providerReads.length, 2);
  assert.equal(event.attempts, 2);
});

for (const kind of ["capture", "payout"] as const) test(`${kind} webhook retries a lost optimistic write before acknowledging durable state`, async () => {
  verification("SUCCESS");
  const event={id:"EVENT1",status:"RECEIVED"};
  const funding={id:"F1",bountyId:"B1",orderId:"ORDER1",captureId:"CAPTURE1",amountCents:3500,status:"COMPLETED",updatedAt:new Date()};
  const payout={id:"P1",bountyId:"B1",batchId:"BATCH1",senderBatchId:"SENDER1",receiverEmail:"receiver@example.test",amountCents:3500,status:"PENDING",provider:"PAYPAL_SANDBOX",updatedAt:new Date()};
  let loseWrite=true,ledgerWrites=0,payoutStatus="SUCCESS";
  const update=async ({data}:{data:Record<string,unknown>})=>{if(loseWrite){loseWrite=false;return {count:0};}Object.assign(kind==="capture"?funding:payout,data);return {count:1};};
  const fake={
    providerWebhookEvent:{upsert:async()=>({...event}),updateMany:async()=>{event.status="PROCESSING";return {count:1};},update:async({data}:{data:{status:string}})=>Object.assign(event,data)},
    funding:{findFirst:async()=>({...funding}),findUnique:async()=>({...funding}),updateMany:update},
    payout:{findFirst:async()=>({...payout}),findUnique:async()=>({...payout}),findUniqueOrThrow:async()=>({...payout}),updateMany:update},
    ledgerEvent:{create:async()=>{ledgerWrites++;}},
    $transaction:async<T>(work:(tx:unknown)=>Promise<T>)=>work(fake),
  };
  Reflect.set(globalThis,"bountyguardDb",fake);
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(url.endsWith("/v1/oauth2/token"))return Response.json({access_token:"test-token",expires_in:300});
    if(url.endsWith("/verify-webhook-signature"))return Response.json({verification_status:"SUCCESS"});
    assert.equal(init?.method,"GET");
    return Response.json(kind==="capture"?{id:"ORDER1",status:"COMPLETED",purchase_units:[{reference_id:"B1",custom_id:"B1",payments:{captures:[{id:"CAPTURE1",status:"COMPLETED",amount:{currency_code:"EUR",value:"35.00"}}]}}]}:{batch_header:{payout_batch_id:"BATCH1",sender_batch_header:{sender_batch_id:"SENDER1"}},items:[{transaction_status:payoutStatus,transaction_id:"TX1",payout_item:{receiver:payout.receiverEmail,amount:{currency:"USD",value:"35.00"}}}]});
  };
  const delivery=()=>kind==="payout"?request():new Request(request().url,{method:"POST",headers:request().headers,body:JSON.stringify({id:"EVENT1",event_type:"PAYMENT.CAPTURE.REVERSED",resource:{id:"CAPTURE1",supplementary_data:{related_ids:{order_id:"ORDER1"}}}})});
  assert.equal((await handlePayPalWebhook(delivery())).status,503);
  assert.equal(event.status,"FAILED");
  assert.equal(ledgerWrites,0);
  assert.equal((await handlePayPalWebhook(delivery())).status,200);
  assert.equal(kind==="capture"?funding.status:payout.status,kind==="capture"?"HOLD":"SUCCESS");
  assert.equal(ledgerWrites,1);
  assert.equal((await handlePayPalWebhook(delivery())).status,200);
  assert.equal(ledgerWrites,1);
  if(kind==="payout"){
    event.id="EVENT2";event.status="RECEIVED";payoutStatus="PENDING";
    const oldEvent=new Request(request().url,{method:"POST",headers:request().headers,body:JSON.stringify({id:"EVENT2",event_type:"PAYMENT.PAYOUTSBATCH.PROCESSING",resource:{payout_batch_id:"BATCH1"}})});
    assert.equal((await handlePayPalWebhook(oldEvent)).status,200);
    assert.equal(payout.status,"SUCCESS");
    assert.equal(ledgerWrites,1);
  }
});

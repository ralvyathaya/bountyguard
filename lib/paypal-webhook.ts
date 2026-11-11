import { z } from "zod";
import { readBody } from "./api";
import { db, json } from "./db";
import { AppError } from "./errors";
import { verifyWebhookSignature } from "./paypal";
import { reconcileFunding, reconcilePayoutBatch } from "./bounty-service";

const webhookSchema = z.object({ id: z.string().min(1).max(200), event_type: z.string().min(1).max(160), resource: z.record(z.string(), z.unknown()) }).passthrough();
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function id(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(value) ? value : null;
}
function linkedId(resource: Record<string, unknown>, path: "captures" | "payouts") {
  if (!Array.isArray(resource.links)) return null;
  for (const linkValue of resource.links) {
    const link = object(linkValue);
    if (link.rel !== "up" || typeof link.href !== "string") continue;
    try {
      const url = new URL(link.href);
      if (url.protocol !== "https:" || !["api-m.sandbox.paypal.com", "api.sandbox.paypal.com"].includes(url.hostname) || url.username || url.password || url.search || url.hash) continue;
      const prefix = path === "captures" ? "/v2/payments/captures/" : "/v1/payments/payouts/";
      if (url.pathname.startsWith(prefix)) return id(url.pathname.slice(prefix.length));
    } catch { /* Only extract identifiers from known Sandbox API paths, never fetch links. */ }
  }
  return null;
}

async function reconcileEvent(event: z.infer<typeof webhookSchema>) {
  const resource = event.resource;
  if (event.event_type.startsWith("PAYMENT.CAPTURE.")) {
    const related = object(object(resource.supplementary_data).related_ids);
    const orderId = id(related.order_id);
    const captureId = id(related.capture_id) ?? linkedId(resource, "captures") ?? id(resource.id);
    const where = [...(orderId ? [{ orderId }] : []), ...(captureId ? [{ captureId }] : [])];
    if (!where.length) return false;
    const funding = await db().funding.findFirst({ where: { OR: where } });
    if (!funding?.orderId) return false;
    try { await reconcileFunding(funding.orderId); }
    catch (error) {
      if (!(error instanceof AppError) || !["FUNDING_HOLD", "CAPTURE_MISMATCH"].includes(error.code)) throw error;
    }
    return true;
  }
  if (!event.event_type.startsWith("PAYMENT.PAYOUTS-ITEM.") && !event.event_type.startsWith("PAYMENT.PAYOUTSBATCH.")) return false;
  const header = object(resource.batch_header);
  const sender = object(header.sender_batch_header);
  const item = object(resource.payout_item);
  const batchId = id(resource.payout_batch_id) ?? id(header.payout_batch_id) ?? linkedId(resource, "payouts");
  const senderBatchId = id(resource.sender_batch_id) ?? id(sender.sender_batch_id);
  const bountyId = id(item.sender_item_id);
  const where = [...(batchId ? [{ batchId }] : []), ...(senderBatchId ? [{ senderBatchId }] : []), ...(bountyId ? [{ bountyId }] : [])];
  if (!where.length) return false;
  const payout = await db().payout.findFirst({ where: { OR: where } });
  const providerBatch = batchId ?? payout?.batchId;
  if (!payout || !providerBatch) return false;
  await reconcilePayoutBatch(payout.id, providerBatch);
  return true;
}

export async function processPayPalWebhook(request: Request) {
  const event = await readBody(request, webhookSchema);
  await verifyWebhookSignature(request.headers, event);
  const stored = await db().providerWebhookEvent.upsert({ where: { id: event.id }, update: {}, create: {
    id: event.id, type: event.event_type, payload: json({ resourceId: id(event.resource.id), eventType: event.event_type }),
  } });
  if (["PROCESSED", "IGNORED"].includes(stored.status)) return { accepted: true, duplicate: true };
  const claimed = await db().providerWebhookEvent.updateMany({ where: { id: event.id, OR: [{ status: { in: ["RECEIVED", "FAILED"] } }, { status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - 120000) } }] }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
  if (!claimed.count) throw new AppError(503, "This event is being processed. Delivery can be retried.", "WEBHOOK_RETRY");
  try {
    const reconciled = await reconcileEvent(event);
    await db().providerWebhookEvent.update({ where: { id: event.id }, data: { status: reconciled ? "PROCESSED" : "IGNORED", processedAt: new Date(), error: null } });
    return { accepted: true, duplicate: false, ignored: !reconciled };
  } catch (error) {
    await db().providerWebhookEvent.update({ where: { id: event.id }, data: { status: "FAILED", error: error instanceof AppError ? error.code : "RECONCILIATION_FAILED" } });
    throw new AppError(503, "PayPal event reconciliation is temporarily unavailable. Delivery can be retried.", "WEBHOOK_RETRY");
  }
}

export async function handlePayPalWebhook(request: Request): Promise<Response> {
  try { return Response.json(await processPayPalWebhook(request), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof AppError ? error.status : 503;
    const message = error instanceof AppError ? error.message : status === 400 ? "Invalid PayPal webhook payload." : "Webhook processing is temporarily unavailable.";
    return Response.json({ error: message, code: error instanceof AppError ? error.code : "WEBHOOK_FAILED" }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

import { db } from "./db";
import { criteriaSchema, verdictSchema } from "./validation";
import type { LedgerRow, AuditStep } from "./types";
import type { Prisma } from "./generated/prisma/client";

export const ledgerInclude = {
  funding: true,
  payout: true,
  currentSubmission: {
    include: { audits: { orderBy: { createdAt: "desc" as const }, take: 1 } },
  },
  events: { orderBy: { createdAt: "desc" as const }, take: 40 },
} satisfies Prisma.BountyInclude;
type LoadedBounty = Prisma.BountyGetPayload<{ include: typeof ledgerInclude }>;
export function toLedgerRow(bounty: LoadedBounty): LedgerRow {
  const submission = bounty.currentSubmission;
  const audit = submission?.audits[0];
  return {
    id: bounty.id,
    title: bounty.title,
    criteria: criteriaSchema.parse(bounty.criteria),
    rewardCents: bounty.rewardCents,
    autoMinScore: bounty.autoMinScore,
    autoMaxCents: bounty.autoMaxCents,
    createdAt: bounty.createdAt.toISOString(),
    submission: submission
      ? {
          id: submission.id,
          receiverEmail: submission.receiverEmail,
          deliverable: submission.deliverable,
          createdAt: submission.createdAt.toISOString(),
        }
      : null,
    audit: audit
      ? {
          id: audit.id,
          status: audit.status,
          verdict: audit.verdict ? verdictSchema.parse(audit.verdict) : null,
          steps: (audit.steps ?? []) as AuditStep[],
          model: audit.model,
          durationMs: audit.durationMs,
          error: audit.error,
          completedAt: audit.completedAt?.toISOString() ?? null,
        }
      : null,
    funding: bounty.funding
      ? {
          status: bounty.funding.status,
          orderId: bounty.funding.orderId,
          captureId: bounty.funding.captureId,
          amountCents: bounty.funding.amountCents,
        }
      : null,
    payout: bounty.payout
      ? {
          id: bounty.payout.id,
          status: bounty.payout.status,
          provider: bounty.payout.provider,
          settlementMode: bounty.payout.settlementMode,
          batchId: bounty.payout.batchId,
          transactionId: bounty.payout.transactionId,
          error: bounty.payout.error,
          receipt: bounty.payout.receipt,
        }
      : null,
    events: bounty.events
      .map((event) => ({
        id: event.id,
        type: event.type,
        message: event.message,
        createdAt: event.createdAt.toISOString(),
      }))
      .reverse(),
  };
}
export async function listLedger() {
  return (
    await db().bounty.findMany({
      include: ledgerInclude,
      orderBy: { createdAt: "desc" },
      take: 500,
    })
  ).map(toLedgerRow);
}

import { db } from "./db";
import { criteriaSchema, verdictSchema } from "./validation";
import type { LedgerRow, AuditStep, SessionRole } from "./types";
import { evidencePolicySchema } from "./validation";
import type { Prisma } from "./generated/prisma/client";

export const ledgerInclude = {
  funding: true,
  payout: true,
  currentSubmission: {
    include: { audits: { orderBy: { createdAt: "desc" as const }, take: 1 }, evidenceSnapshot: true },
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
    evidencePolicy: bounty.evidencePolicy ? evidencePolicySchema.parse(bounty.evidencePolicy) : null,
    createdAt: bounty.createdAt.toISOString(),
    submission: submission
      ? {
          id: submission.id,
          receiverEmail: submission.receiverEmail,
          deliverable: submission.deliverable,
          createdAt: submission.createdAt.toISOString(),
          sourceKind: submission.sourceKind,
          sourceUrl: submission.sourceUrl,
          contributorCountry: submission.contributorCountry,
          evidence: submission.evidenceSnapshot ? {
            repository: submission.evidenceSnapshot.repository,
            prNumber: submission.evidenceSnapshot.prNumber,
            headSha: submission.evidenceSnapshot.headSha,
            fingerprint: submission.evidenceSnapshot.fingerprint,
            eligible: submission.evidenceSnapshot.eligible,
            collectedAt: submission.evidenceSnapshot.collectedAt.toISOString(),
            ...evidenceDetails(submission.evidenceSnapshot.data),
          } : null,
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
function evidenceDetails(value: Prisma.JsonValue) {
  const object = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const checks = Array.isArray(object.checks) ? object.checks : [];
  return {
    baseBranch: typeof object.baseBranch === "string" ? object.baseBranch : "",
    riskFlags: Array.isArray(object.riskFlags) ? object.riskFlags.filter((v): v is string => typeof v === "string") : [],
    checks: checks.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.name !== "string") return [];
      return [{name:item.name, appSlug:typeof item.appSlug === "string" ? item.appSlug : "", headSha:typeof item.headSha === "string" ? item.headSha : "", status:typeof item.status === "string" ? item.status : "unknown", conclusion:typeof item.conclusion === "string" ? item.conclusion : null, ...(typeof item.workflowPath === "string" ? {workflowPath:item.workflowPath} : {})}];
    }),
  };
}

export function redactLedgerRow(row: LedgerRow, role: SessionRole): LedgerRow {
  if (role === "maintainer") return row;
  const verdict = (value: NonNullable<LedgerRow["audit"]>["verdict"]) => value ? {
    ...value, reasoning:"Detailed audit reasoning is available to the maintainer only.",
    criteriaBreakdown:value.criteriaBreakdown.map(item=>({...item,evidence:"Maintainer-only evidence.",feedback:"Maintainer-only feedback."})),
    riskFlags:value.riskFlags.map(()=>"A risk was recorded; maintainer review is required."),
  } : null;
  const safe: LedgerRow = {
    ...row,
    submission: row.submission ? {...row.submission, receiverEmail:"Contributor (private)", deliverable:"Raw deliverable is available to the maintainer only."} : null,
    audit: row.audit ? {...row.audit,verdict:verdict(row.audit.verdict),steps:row.audit.steps.map(step=>({...step,verdict:verdict(step.verdict)!})),error:row.audit.error?"Audit failed. Details are available to the maintainer.":null} : null,
    payout: row.payout ? {...row.payout,error:row.payout.error?"Provider operation needs maintainer attention.":null,receipt:{provider:row.payout.provider,status:row.payout.status,batchId:row.payout.batchId,transactionId:row.payout.transactionId}} : null,
    events:row.events.map(event=>({...event,message:"Maintainer-only event details."})),
  };
  return JSON.parse(JSON.stringify(safe).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[private email]")) as LedgerRow;
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

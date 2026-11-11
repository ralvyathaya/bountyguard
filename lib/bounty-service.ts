import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, json, transaction } from "./db";
import { AppError, requiredEnv } from "./errors";
import { auditDeliverable } from "./agent-auditor";
import {
  createOrder,
  captureOrder,
  createPayout,
  getPayout,
  getVerifiedCapture,
  PayPalError,
  type PayoutResult,
} from "./paypal";
import { dollarsToCents, decideRelease } from "./policy";
import {
  bountySchema,
  submissionSchema,
  criteriaSchema,
  verdictSchema,
  evidencePolicySchema,
} from "./validation";
import { ledgerInclude } from "./ledger";
import type { Payout } from "./generated/prisma/client";
import { collectGitHubEvidence, evidenceForAudit, revalidateGitHubEvidence } from "./github-evidence";
import type { AuditVerdict } from "./types";

function money(value: string) {
  try {
    return dollarsToCents(value);
  } catch (error) {
    throw new AppError(400, (error as Error).message, "INVALID_AMOUNT");
  }
}
export async function createBounty(input: z.infer<typeof bountySchema>) {
  return db().bounty.create({
    data: {
      title: input.title,
      criteria: json(input.criteria),
      rewardCents: money(input.reward),
      autoMinScore: input.autoMinScore,
      autoMaxCents: money(input.autoMaxReward),
      ...(input.evidencePolicy ? { evidencePolicy: json(input.evidencePolicy) } : {}),
      events: {
        create: {
          type: "BOUNTY_CREATED",
          message:
            "Bounty created. Waiting for verified PayPal Sandbox funding.",
        },
      },
    },
  });
}
export async function submitBounty(
  bountyId: string,
  input: z.infer<typeof submissionSchema>,
) {
  const original = await db().bounty.findUnique({ where: { id: bountyId }, include: { funding: true, payout: true } });
  if (!original) throw new AppError(404, "Bounty not found.");
  if (original.funding?.status !== "COMPLETED" || original.payout) throw new AppError(409, "Only a funded bounty without a payout can receive a submission.");
  const policy = original.evidencePolicy ? evidencePolicySchema.parse(original.evidencePolicy) : null;
  if (policy && input.sourceKind !== "GITHUB_PR") throw new AppError(409, "This bounty requires a public GitHub PR from its configured repository.", "EVIDENCE_REQUIRED");
  if (input.sourceKind === "GITHUB_PR" && (!policy || !input.sourceUrl)) throw new AppError(409, "GitHub submissions need a repository evidence policy and a PR URL.", "EVIDENCE_REQUIRED");
  const evidence = policy && input.sourceKind === "GITHUB_PR" ? await collectGitHubEvidence(input.sourceUrl!, policy) : null;
  return transaction(async (tx) => {
    const bounty = await tx.bounty.findUnique({
      where: { id: bountyId },
      include: { funding: true, payout: true },
    });
    if (!bounty) throw new AppError(404, "Bounty not found.");
    if (JSON.stringify(bounty.evidencePolicy) !== JSON.stringify(original.evidencePolicy)) throw new AppError(409, "The bounty evidence policy changed. Reload before submitting.");
    if (bounty.funding?.status !== "COMPLETED")
      throw new AppError(409, "Fund this bounty before submitting work.");
    if (bounty.payout)
      throw new AppError(
        409,
        "This bounty already has a payout operation. Its submission is locked.",
      );
    if (
      bounty.auditClaim &&
      bounty.auditStartedAt &&
      Date.now() - bounty.auditStartedAt.getTime() < 120000
    )
      throw new AppError(
        409,
        "An audit is running. Wait for its result before resubmitting.",
      );
    const submission = await tx.submission.create({
      data: { bountyId, ...input, ...(evidence ? { evidenceSnapshot: { create: { ...evidence, data: json(evidence.data) } } } : {}) },
    });
    await tx.bounty.update({
      where: { id: bountyId },
      data: {
        currentSubmissionId: submission.id,
        auditClaim: null,
        auditStartedAt: null,
      },
    });
    await tx.ledgerEvent.create({
      data: {
        bountyId,
        type: "SUBMISSION_RECEIVED",
        message:
          "New immutable submission received. Prior audit approvals no longer apply.",
      },
    });
    return { submissionId: submission.id };
  });
}
export async function fundOrder(bountyId: string) {
  requiredEnv("PAYPAL_CLIENT_ID");
  requiredEnv("PAYPAL_CLIENT_SECRET");
  const funding = await transaction(async (tx) => {
    const bounty = await tx.bounty.findUnique({
      where: { id: bountyId },
      include: { funding: true },
    });
    if (!bounty) throw new AppError(404, "Bounty not found.");
    if (bounty.funding?.status === "HOLD") throw new AppError(409, "Funding is on hold for provider inspection.", "FUNDING_HOLD");
    if (bounty.funding?.status === "COMPLETED")
      throw new AppError(409, "This bounty is already funded.");
    if (bounty.funding) return bounty.funding;
    return tx.funding.create({
      data: {
        bountyId,
        amountCents: bounty.rewardCents,
        requestId: randomUUID(),
        captureKey: randomUUID(),
      },
    });
  });
  if (funding.orderId) return { orderId: funding.orderId };
  // A lost response is retried with the persisted request ID, never a new order key.
  const result = await createOrder(
    bountyId,
    funding.amountCents,
    funding.requestId,
  );
  await db().funding.updateMany({
    where: { id: funding.id, status: "CREATING" },
    data: { orderId: result.orderId, status: "CREATED" },
  });
  return result;
}
export async function captureFunding(orderId: string) {
  const funding = await db().funding.findUnique({ where: { orderId } });
  if (!funding)
    throw new AppError(
      404,
      "This order does not belong to a BountyGuard bounty.",
    );
  if (funding.status === "HOLD") throw new AppError(409, "Funding is on hold. Inspect the provider capture before continuing.", "FUNDING_HOLD");
  if (funding.status === "COMPLETED") return reconcileFunding(orderId);
  const capture = await captureOrder(orderId, funding.captureKey, {
    bountyId: funding.bountyId,
    amountCents: funding.amountCents,
  });
  await transaction(async (tx) => {
    const updated = await tx.funding.updateMany({
      where: { id: funding.id, status: { notIn: ["COMPLETED", "HOLD"] } },
      data: {
        status: "COMPLETED",
        captureId: capture.captureId,
        receipt: json(capture.receipt),
      },
    });
    if (updated.count)
      await tx.ledgerEvent.create({
        data: {
          bountyId: funding.bountyId,
          type: "FUNDING_CAPTURED",
          message: `Verified USD capture ${capture.captureId}. Funds reserved in the bounty ledger.`,
        },
      });
  });
  const recorded = await db().funding.findUnique({ where: { id: funding.id } });
  if (recorded?.status !== "COMPLETED" || recorded.captureId !== capture.captureId) throw new AppError(409, "Funding changed during capture and is on hold for inspection.", "FUNDING_HOLD");
  return { captureId: capture.captureId, status: "COMPLETED" };
}

export async function reconcileFunding(orderId: string) {
  const funding = await db().funding.findUnique({ where: { orderId } });
  if (!funding) throw new AppError(404, "Funding order not found.");
  let capture: Awaited<ReturnType<typeof getVerifiedCapture>>;
  try {
    capture = await getVerifiedCapture(orderId, { bountyId: funding.bountyId, amountCents: funding.amountCents, captureId: funding.captureId });
  } catch (error) {
    if (error instanceof AppError && ["CAPTURE_MISMATCH", "FUNDING_HOLD"].includes(error.code)) {
      await transaction(async tx => {
        const changed = await tx.funding.updateMany({ where: { id: funding.id, status: { not: "HOLD" }, updatedAt: funding.updatedAt }, data: { status: "HOLD" } });
        if (changed.count) await tx.ledgerEvent.create({ data: { bountyId: funding.bountyId, type: "FUNDING_HOLD", message: "A read-only PayPal check no longer confirms this capture as eligible funding. Release is blocked." } });
      });
      const recorded = await db().funding.findUnique({ where: { id: funding.id } });
      if (recorded?.status !== "HOLD") throw new AppError(503, "Funding changed during reconciliation. Retry the provider check.", "FUNDING_RETRY");
    }
    throw error;
  }
  await transaction(async tx => {
    const changed = await tx.funding.updateMany({ where: { id: funding.id, status: { notIn: ["COMPLETED", "HOLD"] }, updatedAt: funding.updatedAt }, data: { status: "COMPLETED", captureId: capture.captureId, receipt: json(capture.receipt) } });
    if (changed.count) await tx.ledgerEvent.create({ data: { bountyId: funding.bountyId, type: "FUNDING_CAPTURED", message: `Verified USD capture ${capture.captureId} through read-only provider reconciliation.` } });
  });
  const recorded = await db().funding.findUnique({ where: { id: funding.id } });
  if (recorded?.status !== "COMPLETED" || recorded.captureId !== capture.captureId) throw new AppError(409, "Funding remains on hold for maintainer inspection.", "FUNDING_HOLD");
  return { captureId: capture.captureId, status: "COMPLETED" };
}

function withEvidenceRisks(verdict: AuditVerdict, riskFlags: string[]): AuditVerdict {
  return riskFlags.length ? { ...verdict, status: "REVISION_REQUIRED", riskFlags: [...new Set([...riskFlags, ...verdict.riskFlags])].slice(0, 20), reasoning: `${verdict.reasoning}\nDeterministic evidence checks: ${riskFlags.join(" ")}`.slice(0, 8000) } : verdict;
}

export async function runAudit(submissionId: string) {
  const model = requiredEnv("OPENAI_MODEL");
  requiredEnv("OPENAI_API_KEY");
  requiredEnv("OPENAI_BASE_URL");
  const claim = randomUUID();
  const { submission, criteria, auditId } = await transaction(async (tx) => {
    const submission = await tx.submission.findUnique({
      where: { id: submissionId },
      include: { evidenceSnapshot: true, bounty: { include: { funding: true, payout: true } } },
    });
    if (!submission) throw new AppError(404, "Submission not found.");
    const bounty = submission.bounty;
    if (
      bounty.currentSubmissionId !== submissionId ||
      bounty.payout ||
      bounty.funding?.status !== "COMPLETED"
    )
      throw new AppError(
        409,
        "Only the current submission of a funded, unpaid bounty can be audited.",
      );
    if (
      bounty.auditClaim &&
      bounty.auditStartedAt &&
      Date.now() - bounty.auditStartedAt.getTime() < 120000
    )
      throw new AppError(409, "An audit is already running.");
    await tx.auditRun.updateMany({
      where: { submissionId, status: "RUNNING" },
      data: {
        status: "FAILED",
        error: "Previous audit lease expired. No payment was authorized.",
        completedAt: new Date(),
      },
    });
    await tx.bounty.update({
      where: { id: bounty.id },
      data: { auditClaim: claim, auditStartedAt: new Date() },
    });
    const audit = await tx.auditRun.create({
      data: { submissionId, model, receiverEmail: submission.receiverEmail },
    });
    await tx.ledgerEvent.create({
      data: {
        bountyId: bounty.id,
        type: "AUDIT_STARTED",
        message: "Agent started evidence evaluation and adversarial review.",
      },
    });
    return {
      submission,
      criteria: criteriaSchema.parse(bounty.criteria),
      auditId: audit.id,
    };
  });
  const startedAt = performance.now();
  let result: Awaited<ReturnType<typeof auditDeliverable>>;
  try {
    const evidence = submission.evidenceSnapshot ? evidenceForAudit(submission.evidenceSnapshot.data) : null;
    const riskFlags = evidence?.riskFlags ?? (submission.bounty.evidencePolicy ? ["The required immutable GitHub evidence snapshot is missing."] : []);
    result = await auditDeliverable(
      criteria,
      evidence ? `${submission.deliverable}\n\n${evidence.text}` : submission.deliverable,
      async (steps) => {
        await db().auditRun.updateMany({
          where: { id: auditId, status: "RUNNING" },
          data: { steps: json(steps.map(step => ({ ...step, verdict: withEvidenceRisks(step.verdict, riskFlags) }))) },
        });
      },
    );
    result.verdict = withEvidenceRisks(result.verdict, riskFlags);
    result.steps = result.steps.map(step => ({ ...step, verdict: withEvidenceRisks(step.verdict, riskFlags) }));
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : "Audit failed. No payment was authorized.";
    await transaction(async (tx) => {
      await tx.auditRun.updateMany({
        where: { id: auditId, status: "RUNNING" },
        data: {
          status: "FAILED",
          error: message,
          durationMs: Math.round(performance.now() - startedAt),
          completedAt: new Date(),
        },
      });
      await tx.bounty.updateMany({
        where: { id: submission.bountyId, auditClaim: claim },
        data: { auditClaim: null, auditStartedAt: null },
      });
      await tx.ledgerEvent.create({
        data: { bountyId: submission.bountyId, type: "AUDIT_FAILED", message },
      });
    });
    throw error;
  }
  await transaction(async (tx) => {
    const bounty = await tx.bounty.findUnique({
      where: { id: submission.bountyId },
    });
    if (
      bounty?.auditClaim !== claim ||
      bounty.currentSubmissionId !== submissionId
    )
      throw new AppError(
        409,
        "This audit was superseded. Its result cannot authorize a payout.",
      );
    await tx.auditRun.update({
      where: { id: auditId },
      data: {
        status: "COMPLETED",
        verdict: json(result.verdict),
        steps: json(result.steps),
        durationMs: result.durationMs,
        completedAt: new Date(),
      },
    });
    await tx.bounty.update({
      where: { id: bounty.id },
      data: { auditClaim: null, auditStartedAt: null },
    });
    await tx.ledgerEvent.create({
      data: {
        bountyId: bounty.id,
        type: result.verdict.status,
        message: `Audit ${result.verdict.score}/100: ${result.verdict.reasoning}`,
      },
    });
  });
  if (result.verdict.status === "APPROVED") {
    try {
      await settleBounty(submission.bountyId, submissionId, false);
    } catch (error) {
      if (
        !(error instanceof AppError) ||
        error.code !== "HUMAN_APPROVAL_REQUIRED"
      ) {
        await db().ledgerEvent.create({
          data: {
            bountyId: submission.bountyId,
            type: "SETTLEMENT_ATTENTION",
            message:
              error instanceof AppError
                ? error.message
                : "Settlement requires attention. Refresh the ledger before retrying.",
          },
        });
      }
    }
  }
  return result.verdict;
}

async function savePayout(previous: Payout, result: PayoutResult) {
  if (!canTransitionPayout(previous.status, result.status)) return previous;
  return transaction(async (tx) => {
    const updated = await tx.payout.updateMany({
      where: { id: previous.id, updatedAt: previous.updatedAt },
      data: {
        batchId: result.batchId,
        transactionId: result.transactionId,
        status: result.status,
        provider: result.provider,
        receipt: json(result.receipt),
        error: result.error ?? null,
      },
    });
    if (!updated.count) throw new AppError(503, "Payout changed during reconciliation. Retry the provider check.", "PAYOUT_RETRY");
    if (updated.count && previous.status !== result.status)
      await tx.ledgerEvent.create({
        data: {
          bountyId: previous.bountyId,
          type: `PAYOUT_${result.status}`,
          message:
            result.status === "SIMULATED"
              ? "Payout permission fallback: simulated receipt only. Captured funds remain reserved."
              : `PayPal payout ${result.status.toLowerCase()}. ${result.transactionId ? `Transaction ${result.transactionId}.` : "Awaiting an item-level success receipt."}`,
        },
      });
    return tx.payout.findUniqueOrThrow({ where: { id: previous.id } });
  });
}

export function canTransitionPayout(previous: string, next: string) {
  if (previous === "SUCCESS") return ["SUCCESS", "RETURNED", "REFUNDED", "REVERSED"].includes(next);
  if (["RETURNED", "REFUNDED", "REVERSED", "SIMULATED"].includes(previous)) return previous === next;
  return true;
}
async function sendPayout(payout: Payout) {
  try {
    return await savePayout(payout, await createPayout(payout));
  } catch (error) {
    const status =
      error instanceof PayPalError &&
      error.httpStatus >= 400 &&
      error.httpStatus < 500
        ? "FAILED"
        : "UNKNOWN";
    await savePayout(payout, {
      batchId: payout.batchId,
      transactionId: payout.transactionId,
      provider: "PAYPAL_SANDBOX",
      status,
      error:
        error instanceof AppError
          ? error.message
          : "PayPal response unknown; reconcile the existing operation.",
      receipt: { status, senderBatchId: payout.senderBatchId },
    });
    throw error;
  }
}
export async function settleBounty(
  bountyId: string,
  submissionId: string,
  humanApproved: boolean,
) {
  requiredEnv("PAYPAL_CLIENT_ID");
  requiredEnv("PAYPAL_CLIENT_SECRET");
  const preflight = await db().bounty.findUnique({ where: { id: bountyId }, include: { funding: true, payout: true, currentSubmission: { include: { evidenceSnapshot: true } } } });
  if (!preflight) throw new AppError(404, "Bounty not found.");
  if (!preflight.payout) {
    if (preflight.currentSubmissionId !== submissionId || preflight.funding?.status !== "COMPLETED" || !preflight.funding.orderId || !preflight.funding.captureId)
      throw new AppError(409, "The server release policy blocked this payout: verified current funding and submission are required.", "PAYOUT_BLOCKED");
    await reconcileFunding(preflight.funding.orderId);
    if (preflight.evidencePolicy) {
      const evidence = preflight.currentSubmission?.evidenceSnapshot;
      if (!evidence) throw new AppError(409, "Required GitHub evidence is missing.", "EVIDENCE_REQUIRED");
      await revalidateGitHubEvidence(evidence, evidencePolicySchema.parse(preflight.evidencePolicy));
    }
  }
  const claim = await transaction(async (tx) => {
    const bounty = await tx.bounty.findUnique({
      where: { id: bountyId },
      include: ledgerInclude,
    });
    if (!bounty) throw new AppError(404, "Bounty not found.");
    if (bounty.payout) {
      if (bounty.payout.submissionId !== submissionId)
        throw new AppError(409, "Payout belongs to another submission.");
      return { payout: bounty.payout, created: false };
    }
    const submission = bounty.currentSubmission;
    const audit = submission?.audits[0];
    if (
      !submission ||
      submission.id !== submissionId ||
      !audit ||
      audit.status !== "COMPLETED" ||
      !audit.verdict ||
      bounty.auditClaim
    )
      throw new AppError(
        409,
        "A completed audit of the current submission is required.",
      );
    const verdict = verdictSchema.parse(audit.verdict);
    const criteria = criteriaSchema.parse(bounty.criteria);
    const policy = decideRelease({
      ...bounty,
      funded:
        bounty.funding?.status === "COMPLETED" &&
        bounty.funding.amountCents === bounty.rewardCents,
      submissionId,
      receiverEmail: submission.receiverEmail,
      auditedReceiverEmail: audit.receiverEmail,
      score: verdict.score,
      status: verdict.status,
      riskFlags: verdict.riskFlags,
      criteriaPassed:
        criteria.length === verdict.criteriaBreakdown.length &&
        criteria.every((criterion) =>
          verdict.criteriaBreakdown.some(
            (v) => v.criterionId === criterion.id && v.passed,
          ),
        ),
    });
    if (policy === "BLOCKED")
      throw new AppError(
        409,
        "The server release policy blocked this payout.",
        "PAYOUT_BLOCKED",
      );
    if (policy === "HUMAN" && !humanApproved) {
      await tx.ledgerEvent.create({
        data: {
          bountyId,
          type: "AWAITING_APPROVAL",
          message:
            "Approved deliverable is outside autonomous limits. Awaiting maintainer release.",
        },
      });
      return { payout: null, created: false };
    }
    const payout = await tx.payout.create({
      data: {
        bountyId,
        submissionId,
        auditId: audit.id,
        receiverEmail: submission.receiverEmail,
        amountCents: bounty.rewardCents,
        senderBatchId: randomUUID(),
        settlementMode: humanApproved ? "HUMAN" : "AUTO",
        approvedAt: humanApproved ? new Date() : null,
      },
    });
    await tx.ledgerEvent.create({
      data: {
        bountyId,
        type: "PAYOUT_AUTHORIZED",
        message: `${humanApproved ? "Maintainer" : "Agent policy"} authorized one payout operation for the current audited submission.`,
      },
    });
    return { payout, created: true };
  });
  if (!claim.payout)
    throw new AppError(
      409,
      "Awaiting maintainer approval.",
      "HUMAN_APPROVAL_REQUIRED",
    );
  return claim.created ? sendPayout(claim.payout) : claim.payout;
}
export async function syncPayout(id: string) {
  const payout = await db().payout.findUnique({ where: { id } });
  if (!payout) throw new AppError(404, "Payout not found.");
  if (payout.provider === "SIMULATION") return payout;
  if (payout.batchId)
    return savePayout(payout, await getPayout(payout.batchId, payout));
  if (["UNKNOWN", "REQUESTED"].includes(payout.status)) {
    if (Date.now() - payout.createdAt.getTime() > 29 * 86400000)
      throw new AppError(
        409,
        "Provider idempotency window is near expiry. Reconcile this payout in PayPal; no new payment will be issued.",
      );
    if (
      payout.status === "REQUESTED" &&
      Date.now() - payout.updatedAt.getTime() < 60000
    )
      return payout;
    return sendPayout(payout);
  }
  return payout;
}

export async function reconcilePayoutBatch(id: string, batchId: string) {
  const payout = await db().payout.findUnique({ where: { id } });
  if (!payout) throw new AppError(404, "Payout not found.");
  if (payout.provider === "SIMULATION") return payout;
  if (payout.batchId && payout.batchId !== batchId) throw new AppError(409, "Webhook batch does not match the stored payout.", "PAYOUT_MISMATCH");
  return savePayout(payout, await getPayout(batchId, payout));
}

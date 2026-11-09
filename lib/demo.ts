import type { AuditVerdict, LedgerRow } from "./types";
import { rowRelease } from "./policy";

const baseTime = "2026-11-09T03:00:00.000Z";
const criteria = [
  {
    id: "implementation",
    text: "Implement the requested behavior with clear, reviewable evidence.",
  },
  {
    id: "tests",
    text: "Include regression tests for the success path and failure cases.",
  },
  {
    id: "documentation",
    text: "Document the change, verification steps, and limitations.",
  },
];
export const demoTemplates = [
  {
    id: "BG-1042",
    title: "Fix duplicate webhook delivery",
    rewardCents: 3500,
    email: "aditya@jakarta.example",
    country: "Indonesia",
  },
  {
    id: "BG-1043",
    title: "Add checkout regression coverage",
    rewardCents: 4500,
    email: "mariana@saopaulo.example",
    country: "Brazil",
  },
  {
    id: "BG-1044",
    title: "Design multi-region settlement architecture",
    rewardCents: 25000,
    email: "amara@lagos.example",
    country: "Nigeria",
  },
  {
    id: "BG-1041",
    title: "Make currency inputs locale-safe",
    rewardCents: 5000,
    email: "linh@hanoi.example",
    country: "Vietnam",
  },
  {
    id: "BG-1040",
    title: "Document the sandbox capture flow",
    rewardCents: 1800,
    email: "sofia@lisbon.example",
    country: "Portugal",
  },
  {
    id: "BG-1039",
    title: "Harden the payout retry strategy",
    rewardCents: 12500,
    email: "mateo@bogota.example",
    country: "Colombia",
  },
  {
    id: "BG-1038",
    title: "Cover missing authorization checks",
    rewardCents: 6000,
    email: "nour@cairo.example",
    country: "Egypt",
  },
  {
    id: "BG-1037",
    title: "Improve contributor onboarding docs",
    rewardCents: 7500,
    email: "yuki@osaka.example",
    country: "Japan",
  },
];
export function demoVerdict(
  row: LedgerRow,
  score: number,
  rejected = false,
): AuditVerdict {
  return {
    score,
    status: rejected ? "REVISION_REQUIRED" : "APPROVED",
    criteriaBreakdown: row.criteria.map((criterion, index) => ({
      criterionId: criterion.id,
      passed: !(rejected && index === 1),
      evidence:
        rejected && index === 1
          ? "No regression tests are included in the submitted patch."
          : `Judge fixture: ${["Implementation addresses the requested behavior.", "Regression cases cover success and failure paths.", "Verification steps and limitations are documented."][index % 3]}`,
      feedback:
        rejected && index === 1
          ? "Add a test reproducing the bug and verify that repeated requests do not create duplicate operations."
          : "Criterion satisfied by the supplied demo evidence.",
    })),
    reasoning: rejected
      ? "The implementation is incomplete: regression coverage is missing. Revise the submission before funds can be released."
      : "All acceptance criteria are supported by the judge fixture. No blocking risks were identified.",
    riskFlags: rejected ? ["Missing regression test coverage"] : [],
  };
}
export function demoEvent(type: string, message: string) {
  return {
    id: crypto.randomUUID(),
    type,
    message,
    createdAt: new Date().toISOString(),
  };
}
export function completeDemoAudit(
  row: LedgerRow,
  score: number,
  rejected = false,
  durationMs = 1800,
): LedgerRow {
  const verdict = demoVerdict(row, score, rejected);
  const audited: LedgerRow = {
    ...row,
    payout: null,
    audit: {
      id: `demo-audit-${row.id}`,
      status: "COMPLETED",
      verdict,
      model: "Deterministic judge fixture",
      steps: [
        { name: "Evidence evaluation", verdict },
        { name: "Adversarial review", verdict },
      ],
      durationMs,
      error: null,
      completedAt: new Date().toISOString(),
    },
    events: [
      ...row.events,
      demoEvent(
        verdict.status,
        `Fixture audit completed at ${score}/100. ${verdict.reasoning}`,
      ),
    ],
  };
  return rowRelease(audited) === "AUTO"
    ? releaseDemo(audited, "AUTO")
    : {
        ...audited,
        events: [
          ...audited.events,
          demoEvent(
            rejected ? "PAYOUT_BLOCKED" : "AWAITING_APPROVAL",
            rejected
              ? "Release policy blocked payout. Funds remain reserved."
              : "Outside autonomous limits. Awaiting maintainer release.",
          ),
        ],
      };
}
export function releaseDemo(
  row: LedgerRow,
  settlementMode: "AUTO" | "HUMAN",
): LedgerRow {
  if (rowRelease(row) === "BLOCKED" || row.payout) return row;
  return {
    ...row,
    payout: {
      id: `demo-payout-${row.id}`,
      status: "SIMULATED",
      provider: "SIMULATION",
      settlementMode,
      batchId: null,
      transactionId: `SIM-${row.id}-${settlementMode}`,
      error: null,
      receipt: {
        simulated: true,
        amount: row.rewardCents / 100,
        currency: "USD",
        receiver: row.submission?.receiverEmail,
        mode: settlementMode,
      },
    },
    events: [
      ...row.events,
      demoEvent(
        "PAYOUT_SIMULATED",
        `${settlementMode === "AUTO" ? "Agent policy" : "Maintainer"} released the simulated reward. No PayPal API was called.`,
      ),
    ],
  };
}
export function createDemoRows(): LedgerRow[] {
  const rows: LedgerRow[] = demoTemplates.map((item) => ({
    id: item.id,
    title: item.title,
    criteria: criteria.map((v) => ({ ...v })),
    rewardCents: item.rewardCents,
    autoMinScore: 90,
    autoMaxCents: 5000,
    createdAt: baseTime,
    submission: {
      id: `demo-submission-${item.id}`,
      receiverEmail: item.email,
      createdAt: baseTime,
      deliverable: `Demo deliverable from ${item.country}.\n\nImplementation: the patch fixes the requested behavior.\nTests: regression coverage includes successful and failed requests.\nDocumentation: setup, verification, and limitations are included.\n\nThis is seeded judge evidence, not a verified repository.`,
    },
    funding: {
      status: "COMPLETED",
      orderId: `SIM-ORDER-${item.id}`,
      captureId: `SIM-CAPTURE-${item.id}`,
      amountCents: item.rewardCents,
    },
    audit: null,
    payout: null,
    events: [
      {
        id: `seed-${item.id}`,
        type: "DEMO_FUNDED",
        message: `Seeded ${item.country} bounty. Funding is simulated.`,
        createdAt: baseTime,
      },
    ],
  }));
  rows[3] = completeDemoAudit(rows[3], 98, false, 4200);
  rows[4] = completeDemoAudit(rows[4], 95, false, 3600);
  rows[5] = completeDemoAudit(rows[5], 94, false, 5100);
  rows[6] = completeDemoAudit(rows[6], 58, true, 3900);
  rows[7] = { ...rows[7], submission: null };
  return rows;
}

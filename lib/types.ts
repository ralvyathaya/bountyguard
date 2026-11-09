export type Criterion = { id: string; text: string };
export type AuditVerdict = {
  score: number;
  status: "APPROVED" | "REVISION_REQUIRED";
  criteriaBreakdown: {
    criterionId: string;
    passed: boolean;
    evidence: string;
    feedback: string;
  }[];
  reasoning: string;
  riskFlags: string[];
};
export type AuditStep = { name: string; verdict: AuditVerdict };
export type LedgerRow = {
  id: string;
  title: string;
  criteria: Criterion[];
  rewardCents: number;
  autoMinScore: number;
  autoMaxCents: number;
  createdAt: string;
  submission: {
    id: string;
    receiverEmail: string;
    deliverable: string;
    createdAt: string;
  } | null;
  audit: {
    id: string;
    status: string;
    verdict: AuditVerdict | null;
    steps: AuditStep[];
    model: string;
    durationMs: number | null;
    error: string | null;
    completedAt: string | null;
  } | null;
  funding: {
    status: string;
    orderId: string | null;
    captureId: string | null;
    amountCents: number;
  } | null;
  payout: {
    id: string;
    status: string;
    provider: string;
    settlementMode: string;
    batchId: string | null;
    transactionId: string | null;
    error: string | null;
    receipt: unknown;
  } | null;
  events: { id: string; type: string; message: string; createdAt: string }[];
};
export type AppMode = "demo" | "connected";

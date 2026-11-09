import type { LedgerRow } from "./types";

export function dollarsToCents(value: string): number {
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value))
    throw new Error("Use a USD amount with at most two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000)
    throw new Error("Reward must be between $0.01 and $1,000,000.");
  return cents;
}
export function paypalAmount(cents: number) {
  if (!Number.isSafeInteger(cents) || cents <= 0)
    throw new Error("Invalid amount in cents.");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
export const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );

type ReleaseInput = {
  rewardCents: number;
  autoMaxCents: number;
  autoMinScore: number;
  funded: boolean;
  submissionId: string;
  currentSubmissionId: string | null;
  receiverEmail: string;
  auditedReceiverEmail: string;
  score: number;
  status: string;
  criteriaPassed: boolean;
  riskFlags: string[];
};
export function decideRelease(
  input: ReleaseInput,
): "AUTO" | "HUMAN" | "BLOCKED" {
  if (
    !input.funded ||
    input.submissionId !== input.currentSubmissionId ||
    input.receiverEmail !== input.auditedReceiverEmail ||
    input.status !== "APPROVED" ||
    !input.criteriaPassed ||
    input.riskFlags.length ||
    !Number.isInteger(input.score) ||
    input.score < 0 ||
    input.score > 100
  )
    return "BLOCKED";
  return input.rewardCents <= input.autoMaxCents &&
    input.score >= input.autoMinScore
    ? "AUTO"
    : "HUMAN";
}
export function rowRelease(row: LedgerRow) {
  if (
    !row.submission ||
    !row.audit?.verdict ||
    row.audit.status !== "COMPLETED"
  )
    return "BLOCKED";
  const verdict = row.audit.verdict;
  return decideRelease({
    ...row,
    funded: row.funding?.status === "COMPLETED",
    submissionId: row.submission.id,
    currentSubmissionId: row.submission.id,
    receiverEmail: row.submission.receiverEmail,
    auditedReceiverEmail: row.submission.receiverEmail,
    score: verdict.score,
    status: verdict.status,
    criteriaPassed:
      verdict.criteriaBreakdown.length === row.criteria.length &&
      row.criteria.every((criterion) =>
        verdict.criteriaBreakdown.some(
          (v) => v.criterionId === criterion.id && v.passed,
        ),
      ),
    riskFlags: verdict.riskFlags,
  });
}
export function rowStatus(row: LedgerRow): string {
  if (row.payout)
    return row.payout.status === "SUCCESS" ? "SETTLED" : row.payout.status;
  if (row.audit?.status === "RUNNING") return "AUDITING";
  if (row.audit?.status === "FAILED") return "AUDIT_FAILED";
  if (row.audit?.verdict?.status === "REVISION_REQUIRED")
    return "REVISION_REQUIRED";
  if (row.audit?.verdict)
    return rowRelease(row) === "AUTO"
      ? "READY_FOR_PAYOUT"
      : rowRelease(row) === "HUMAN"
        ? "AWAITING_APPROVAL"
        : "BLOCKED";
  if (row.submission) return "SUBMITTED";
  return row.funding?.status === "COMPLETED"
    ? "FUNDED"
    : row.funding?.status === "CREATING"
      ? "FUNDING_PENDING"
      : "UNFUNDED";
}
export function safeCsvValue(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /^[\s]*[=+\-@\t\r\n]/.test(text) || /^[\t\r\n]/.test(text)
    ? `'${text}`
    : text;
}
export const statusLabel = (status: string) =>
  status
    .toLowerCase()
    .split("_")
    .map((v) => v.charAt(0).toUpperCase() + v.slice(1))
    .join(" ");
export function isReleased(row: LedgerRow, demo: boolean) {
  return demo
    ? row.payout?.status === "SIMULATED" || row.payout?.status === "SUCCESS"
    : row.payout?.status === "SUCCESS" &&
        row.payout.provider === "PAYPAL_SANDBOX";
}
export function ledgerKpis(rows: LedgerRow[], demo: boolean) {
  const finished = rows.flatMap((row) =>
    row.audit?.status === "COMPLETED" && row.audit.durationMs != null
      ? [row.audit.durationMs]
      : [],
  );
  return {
    fundedCents: rows.reduce(
      (sum, row) =>
        sum +
        (row.funding?.status === "COMPLETED" ? row.funding.amountCents : 0),
      0,
    ),
    autonomousPayouts: rows.filter(
      (row) =>
        row.payout?.settlementMode === "AUTO" &&
        (demo
          ? row.payout.status === "SIMULATED"
          : row.payout.status === "SUCCESS" &&
            row.payout.provider === "PAYPAL_SANDBOX"),
    ).length,
    averageMs: finished.length
      ? Math.round(
          finished.reduce((sum, value) => sum + value, 0) / finished.length,
        )
      : null,
    prevented: rows.filter(
      (row) => row.audit?.verdict?.status === "REVISION_REQUIRED",
    ).length,
  };
}

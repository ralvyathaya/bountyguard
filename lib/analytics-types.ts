export type AnalyticsRecord = Record<string, string | number | boolean | null>;
export type AnalyticsSummary = {
  fundedCents: number;
  autonomousPayouts: number;
  settledCents: number;
  averageMs: number | null;
  prevented: number;
  blockedCents: number;
  bountyCount: number;
};
export type AnalyticsSnapshot = {
  asOf: string;
  range: { from: string | null; to: string | null };
  sources: Record<"bounties" | "audits" | "criteria" | "funding" | "payouts" | "events", AnalyticsRecord[]>;
  summary: AnalyticsSummary;
};

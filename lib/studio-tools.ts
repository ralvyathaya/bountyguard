import { z } from "zod";
import type { AnalyticsSnapshot } from "./analytics-types";
import { decideRelease } from "./policy";
export const STUDIO_AGENT_IDS = ["bountyguard", "lead", "planning", "data", "page", "widget"] as const;
export const STUDIO_PRESETS = ["funding", "blocked", "approvals", "criteria", "decision", "policy", "settlement", "ledger"] as const;
export const STUDIO_WIDGET_TYPES = ["value", "bar-chart-grouped", "column-chart-grouped", "donut-chart", "grid", "decision-path", "policy-what-if", "settlement-proof"] as const;
const empty = z.object({}).strict();
const id = z.string().min(1).max(128).regex(/^[\w-]+$/);
export const studioToolSchemas = {
    guard_view_data: empty,
    guard_view_report: empty,
    guard_query: z.object({ source: z.enum(["bounties", "audits", "criteria", "funding", "payouts", "events"]), groupBy: z.enum(["status", "releaseMode", "country", "sourceKind", "criterionId", "failedCriteria", "result", "settlementMode", "type"]).optional(), metric: z.enum(["count", "rewardUsd", "fundedUsd", "payoutUsd", "blockedUsd", "durationMs", "auditScore", "rejectedSubmissionCount"]).default("count"), filter: z.object({ field: z.enum(["status", "result", "criterionId", "releaseMode", "country", "sourceKind"]), value: z.string().min(1).max(200) }).strict().optional() }).strict(),
    guard_add_widget: z.object({ preset: z.enum(STUDIO_PRESETS), title: z.string().min(1).max(100), pageId: z.enum(["operations", "risk", "settlement"]).optional() }).strict(),
    guard_open_bounty: z.object({ bountyId: id }).strict(),
    guard_filter_bounties: z.object({ status: z.string().min(1).max(64) }).strict(),
    guard_simulate_policy: z.object({ minimumScore: z.number().int().min(0).max(100), maximumUsd: z.number().min(0.01).max(1000000) }).strict(),
    delegate_to: z.object({ type: z.object({ id: z.enum(["lead", "planning", "data", "page", "widget"]) }).strict(), instructions: z.string().min(1).max(3000) }).strict(),
    complete_task: z.object({ summary: z.string().min(1).max(6000), artifacts: z.array(z.object({ id: z.string().max(128), type: z.string().max(100), description: z.string().max(500) }).strict()).max(20) }).strict(),
} as const;
export type StudioToolName = keyof typeof studioToolSchemas;
const descriptions: Record<StudioToolName, string> = {
    guard_view_data: "Read the trusted financial data schema, metric definitions, and current aggregate summary.",
    guard_view_report: "Inspect existing dashboard pages and widgets before adding widgets.",
    guard_query: "Aggregate a selected source without running code or SQL. Count by status/criterion/country or sum a named metric on bounties. For rejected submissions by failed criterion use source=criteria, groupBy=criterionId, metric=rejectedSubmissionCount; this counts only the latest completed audit per submission. For held value use source=bounties, groupBy=failedCriteria, metric=blockedUsd. Money never belongs to joined criterion rows.",
    guard_add_widget: "Add a fully configured dashboard widget. Presets: funding=funded USD by status; blocked=held USD by failed-criterion combination; approvals=reward USD by release mode; criteria=rejected submissions by failed criterion; decision=clickable evidence timeline; policy=read-only threshold simulator; settlement=provider receipt cards; ledger=bounty grid. Use the page's existing layout.",
    guard_open_bounty: "Open a bounty's audit inspector. This is navigation only and cannot approve, audit, fund, or release a payment.",
    guard_filter_bounties: "Show matching operational ledger rows for one exact status; does not mutate financial data.",
    guard_simulate_policy: "Compare hypothetical score and USD auto-release thresholds against currently approved, funded evidence. Never changes actual policy or releases money.",
    delegate_to: "Delegate a concise analytical/dashboard task to a built-in Studio agent. Use lead for dashboard composition, data for analysis, and widget/page for a widget. The delegated agent runs to completion and returns a summary.",
    complete_task: "Return a summary and actual created artifact IDs to the requesting agent. Use an empty artifacts array when no widgets were created.",
};
export const toolNamesForAgent = (agentId: string): StudioToolName[] => [
    "guard_view_data", "guard_view_report", "guard_query", "guard_add_widget", "guard_open_bounty", "guard_filter_bounties", "guard_simulate_policy",
    ...(agentId === "bountyguard" || agentId === "lead" ? ["delegate_to" as const] : []),
    ...(agentId !== "bountyguard" ? ["complete_task" as const] : []),
];
export function validateStudioTool(name: string, args: unknown): Record<string, unknown> {
    if (!Object.hasOwn(studioToolSchemas, name))
        throw new Error("Tool is not allowed.");
    return studioToolSchemas[name as StudioToolName].parse(args);
}
export function studioToolDefinitions(agentId: string) {
    return toolNamesForAgent(agentId).map(name => ({ name, description: descriptions[name], parameters: z.toJSONSchema(studioToolSchemas[name]) }));
}
export type StudioEnvelope = {
    text: string;
    toolCalls: {
        name: StudioToolName;
        args: Record<string, unknown>;
    }[];
};
export function scriptedWidgetCalls(prompt: string): StudioEnvelope["toolCalls"] {
    const text = prompt.toLowerCase();
    const presets: typeof STUDIO_PRESETS[number][] = text.includes("fund") && text.includes("blocked") && text.includes("approval") ? ["funding", "blocked", "approvals"] : [text.includes("criterion") || text.includes("rejected") ? "criteria" : text.includes("fund") ? "funding" : text.includes("approval") ? "approvals" : "blocked"];
    const titles = { funding: "Funding by status", blocked: "Value held for revision", approvals: "Approval bottlenecks", criteria: "Rejected submissions by criterion", decision: "Decision Path", policy: "Policy What-if", settlement: "Settlement Proof", ledger: "Bounty ledger" };
    return presets.map(preset => ({ name: "guard_add_widget", args: { preset, title: titles[preset] } }));
}
export function parseStudioEnvelope(text: string, agentId = "bountyguard"): StudioEnvelope {
    const clean = text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, "$1");
    const value = z.object({ text: z.string().max(16000), toolCalls: z.array(z.object({ name: z.string(), args: z.record(z.string(), z.unknown()) }).strict()).max(5) }).strict().parse(JSON.parse(clean));
    const allowed = toolNamesForAgent(agentId);
    return { text: value.text, toolCalls: value.toolCalls.map(call => {
            if (!allowed.includes(call.name as StudioToolName))
                throw new Error("Tool is not allowed for this agent.");
            return { name: call.name as StudioToolName, args: validateStudioTool(call.name, call.args) };
        }) };
}
export function queryStudioData(snapshot: AnalyticsSnapshot, args: Record<string, unknown>) {
    const checked = studioToolSchemas.guard_query.parse(args);
    const metrics: Record<typeof checked.source, readonly string[]> = {
        bounties: ["count", "rewardUsd", "fundedUsd", "payoutUsd", "blockedUsd", "durationMs", "auditScore"],
        audits: ["count", "durationMs"], criteria: ["count", "rejectedSubmissionCount"], funding: ["count"], payouts: ["count"], events: ["count"],
    };
    if (!metrics[checked.source].includes(checked.metric))
        throw new Error("This metric is unavailable on the selected source. Use the one-per-bounty financial facts for money measures.");
    const dimensions: Record<typeof checked.source, readonly string[]> = {
        bounties: ["status", "releaseMode", "country", "sourceKind", "failedCriteria"], audits: ["status"],
        criteria: ["criterionId", "result"], funding: ["status"], payouts: ["status", "settlementMode"], events: ["type"],
    };
    if ((checked.groupBy && !dimensions[checked.source].includes(checked.groupBy)) || (checked.filter && !dimensions[checked.source].includes(checked.filter.field)))
        throw new Error("This grouping or filter field is unavailable on the selected source.");
    const grouped = new Map<string, number>();
    for (const row of snapshot.sources[checked.source]) {
        if (checked.filter && String(row[checked.filter.field] ?? "") !== checked.filter.value)
            continue;
        const group = checked.groupBy ? String(row[checked.groupBy] ?? "Not provided") : "All records";
        const value = checked.metric === "count" ? 1 : typeof row[checked.metric] === "number" ? row[checked.metric] : 0;
        grouped.set(group, (grouped.get(group) ?? 0) + Number(value));
    }
    return { source: checked.source, metric: checked.metric, groupBy: checked.groupBy ?? null, groups: [...grouped].slice(0, 100).map(([group, value]) => ({ group, value })), totalGroups: grouped.size, asOf: snapshot.asOf };
}
export function simulateStudioPolicy(snapshot: AnalyticsSnapshot, args: Record<string, unknown>) {
    const { minimumScore, maximumUsd } = studioToolSchemas.guard_simulate_policy.parse(args);
    let eligibleCount = 0, eligibleCents = 0;
    for (const row of snapshot.sources.bounties) {
        const key = String(row.id);
        const decision = decideRelease({ rewardCents: Number(row.rewardCents), autoMaxCents: Math.round(maximumUsd * 100), autoMinScore: minimumScore, funded: row.funded === true, submissionId: key, currentSubmissionId: key, receiverEmail: "snapshot", auditedReceiverEmail: "snapshot", score: Number(row.auditScore), status: row.approved === true ? "APPROVED" : "REVISION_REQUIRED", criteriaPassed: Number(row.criteriaTotal) > 0 && row.criteriaPassed === row.criteriaTotal, riskFlags: Number(row.riskCount) > 0 ? ["Recorded risk flags"] : [] });
        if (decision === "AUTO") {
            eligibleCount++;
            eligibleCents += Number(row.rewardCents);
        }
    }
    return { minimumScore, maximumUsd, eligibleCount, eligibleCents, asOf: snapshot.asOf, note: "Hypothetical last-verified snapshot only. No policy or payment was changed. Actual release revalidates the submission, receiver, CI and provider funding." };
}

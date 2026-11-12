"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { createWidgets, type AgRegistry, type AgWidgetDefinition } from "ag-studio-react";
import type { AgDefaultWidgetDefinition, AgReportState, AgWidgetData, AgWidgetDataFormat, AgWidgetFieldReference, AgWidgetParams, AgWidgetRowsResult, AgWidgetDataResponse } from "ag-studio";
import type { AnalyticsSnapshot } from "@/lib/analytics-types";
import type { LedgerRow } from "@/lib/types";
import { usd, statusLabel } from "@/lib/policy";
import { simulateStudioPolicy, STUDIO_WIDGET_TYPES, type STUDIO_PRESETS } from "@/lib/studio-tools";
export type GuardWidgetType = "decision-path" | "policy-what-if" | "settlement-proof";
export type GuardWidgetData = AgWidgetData<{
    records: AgWidgetFieldReference[];
}, AgWidgetDataFormat<unknown>> & {
    type: GuardWidgetType;
};
type GuardDefinition = AgWidgetDefinition<GuardWidgetType, GuardWidgetData>;
export interface GuardRegistry extends AgRegistry {
    widgets: readonly (AgDefaultWidgetDefinition | GuardDefinition)[];
}
export type StudioReport = AgReportState<GuardRegistry>;
type StudioContextValue = {
    snapshot: AnalyticsSnapshot;
    rows: LedgerRow[];
    demo: boolean;
    onInspect: (id: string) => void;
    onFilter: (ids: string[] | null) => void;
};
export const GuardStudioContext = createContext<StudioContextValue | null>(null);
function useStudioData() { const context = useContext(GuardStudioContext); if (!context)
    throw new Error("Studio context is unavailable."); return context; }
function useWidgetBounties(params: AgWidgetParams<GuardWidgetData>) {
    const context = useStudioData();
    const [ids, setIds] = useState<string[] | null>(null);
    const [error, setError] = useState("");
    const fields = params.dataMapping.records ?? [];
    useEffect(() => {
        if (!fields.length)
            return;
        const abort = new AbortController();
        let alive = true;
        const receive = (response: AgWidgetDataResponse<AgWidgetRowsResult>) => { if (!alive || response.replaced)
            return; const result = response.crossFilter ?? response.results; const field = fields[0]; const matchingIds = result.rows.map(row => String(row[field.key] ?? row.id ?? "")).filter(Boolean); setIds(matchingIds); context.onFilter(matchingIds); };
        params.widgetApi.getData({ fields }, { queryId: "guard-bounty-identities", signal: abort.signal, onDataUpdated: receive }).then(receive).catch(() => { if (!abort.signal.aborted)
            setError("Unable to load the selected bounties."); });
        return () => { alive = false; abort.abort(); };
    }, [params.widgetApi, fields]);
    const facts = ids === null ? context.snapshot.sources.bounties : context.snapshot.sources.bounties.filter(row => ids.includes(String(row.id)));
    return { ...context, facts, error, fields };
}
function DecisionPath(params: AgWidgetParams<GuardWidgetData>) {
    const { facts, rows, error, onInspect, onFilter, fields } = useWidgetBounties(params);
    const [chosen, setChosen] = useState("");
    const fact = facts.find(row => row.id === chosen) ?? facts[0];
    const row = rows.find(item => item.id === fact?.id);
    if (error)
        return <p className="studio-widget-empty">{error}</p>;
    if (!fact)
        return <p className="studio-widget-empty">No bounties match the current filters.</p>;
    const steps = [{ name: "Funding", detail: row?.funding?.status ?? (fact.funded ? "COMPLETED" : "UNFUNDED"), done: fact.funded === true }, { name: "Evidence", detail: fact.sourceKind === "GITHUB_PR" ? String(fact.headSha ?? "Awaiting snapshot").slice(0, 10) : "Pasted evidence", done: !!row?.submission }, { name: "Audit", detail: typeof fact.auditScore === "number" ? `${fact.auditScore}/100` : "Not audited", done: fact.approved === true }, { name: "Policy", detail: String(fact.releaseMode), done: fact.releaseMode === "AUTO" }, { name: "Settlement", detail: String(fact.status), done: fact.status === "SETTLED" || fact.status === "SIMULATED" }];
    return <div className="guard-widget"><label className="studio-control-label">Decision for<select value={String(fact.id)} onChange={event => setChosen(event.target.value)}>{facts.map(item => <option key={String(item.id)} value={String(item.id)}>{String(item.title)}</option>)}</select></label><div className="decision-steps">{steps.map((step, index) => <button type="button" key={step.name} className={step.done ? "step-complete" : ""} onClick={() => onInspect(String(fact.id))}><span className="decision-step-index">{step.done ? "✓" : index + 1}</span><span><strong>{step.name}</strong><small>{statusLabel(step.detail)}</small></span></button>)}</div><div className="studio-widget-actions"><button type="button" onClick={() => onInspect(String(fact.id))}>Inspect evidence →</button><button type="button" onClick={() => { onFilter([String(fact.id)]); if (fields[0])
        params.widgetApi.toggleCrossFilter({ type: "value", group: 0, field: fields[0], value: fact.id }); }}>Cross-filter this bounty</button></div></div>;
}
function PolicyWhatIf(params: AgWidgetParams<GuardWidgetData>) {
    const { snapshot, facts, error } = useWidgetBounties(params);
    const [score, setScore] = useState(90), [cap, setCap] = useState(50);
    const result = simulateStudioPolicy({ ...snapshot, sources: { ...snapshot.sources, bounties: facts } }, { minimumScore: score, maximumUsd: cap });
    if (error)
        return <p className="studio-widget-empty">{error}</p>;
    return <div className="guard-widget"><span className="studio-simulation-label">Hypothetical · no payments</span><div className="policy-control"><label htmlFor={`${params.widgetId}-score`}>Minimum audit score <strong>{score}/100</strong></label><input id={`${params.widgetId}-score`} type="range" min="0" max="100" value={score} onChange={event => setScore(Number(event.target.value))}/></div><div className="policy-control"><label htmlFor={`${params.widgetId}-cap`}>Auto-release limit <strong>{usd(cap * 100)}</strong></label><input id={`${params.widgetId}-cap`} type="range" min="1" max="500" value={cap} onChange={event => setCap(Number(event.target.value))}/></div><div className="policy-result"><strong>{usd(result.eligibleCents)}</strong><span>{result.eligibleCount} approved, funded bounties could qualify</span></div><p className="studio-fine-print">Uses the last verified snapshot. Actual release rechecks evidence, recipient and funding. Policy is unchanged.</p></div>;
}
function SettlementProof(params: AgWidgetParams<GuardWidgetData>) {
    const { snapshot, facts, error, onInspect, demo } = useWidgetBounties(params);
    if (error)
        return <p className="studio-widget-empty">{error}</p>;
    if (!facts.length)
        return <p className="studio-widget-empty">No settlement records match the current filters.</p>;
    function download(id: string) {
        if (!demo) {
            window.open(`/api/receipts/${encodeURIComponent(id)}`, "_blank", "noopener,noreferrer");
            return;
        }
        const packet = { source: "DEMO_FIXTURES", simulated: true, bounty: facts.find(row => row.id === id), funding: snapshot.sources.funding.filter(row => row.bountyId === id), payouts: snapshot.sources.payouts.filter(row => row.bountyId === id), asOf: snapshot.asOf };
        const url = URL.createObjectURL(new Blob([JSON.stringify(packet, null, 2)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${id}-demo-audit-packet.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    return <div className="guard-widget receipt-list">{facts.slice(0, 5).map(fact => { const funding = snapshot.sources.funding.find(item => item.bountyId === fact.id), payout = snapshot.sources.payouts.find(item => item.bountyId === fact.id); return <article key={String(fact.id)} className="studio-receipt"><div><strong>{String(fact.title)}</strong><span>{statusLabel(String(payout?.status ?? funding?.status ?? "UNFUNDED"))}{demo ? " · Demo" : " · PayPal Sandbox"}</span></div><dl><dt>Capture</dt><dd>{String(funding?.captureId ?? "Not captured")}</dd><dt>Payout</dt><dd>{String(payout?.transactionId ?? payout?.batchId ?? "Not released")}</dd></dl><div className="studio-widget-actions"><button type="button" onClick={() => onInspect(String(fact.id))}>Inspect</button><button type="button" onClick={() => download(String(fact.id))}>Audit packet ↗</button></div></article>; })}</div>;
}
const customComponents: Pick<GuardDefinition, "id" | "label" | "comp">[] = [
    { id: "decision-path", label: "Decision Path", comp: DecisionPath },
    { id: "policy-what-if", label: "Policy What-if", comp: PolicyWhatIf },
    { id: "settlement-proof", label: "Settlement Proof", comp: SettlementProof },
];
const customDefinitions = customComponents.map<GuardDefinition>(definition => ({ ...definition, defaultSize: { width: 560, height: 420 }, minSize: { width: 300, height: 240 }, dataMapping: { records: { type: "fieldset", supportedRoles: ["category"], required: true } }, form: params => params.createDefaults({ supportsTriggerCrossFilter: true, dataMappingItems: [{ key: "records", label: "Bounty identity" }] }), defaultState: { dataMapping: { records: [{ id: "bounties.id" }] } } }));
const configuredWidgets = createWidgets<GuardRegistry>({ additionalTypes: customDefinitions, menu: [{ label: "Garda evidence", widgetIds: ["decision-path", "policy-what-if", "settlement-proof"] }, { label: "Financial analytics", widgetIds: ["value", "bar-chart-grouped", "column-chart-grouped", "donut-chart", "grid"] }] });
export const guardWidgets = { ...configuredWidgets, widgets: configuredWidgets.widgets.filter(widget => (STUDIO_WIDGET_TYPES as readonly string[]).includes(widget.id)) };
type Preset = typeof STUDIO_PRESETS[number];
export function presetWidget(preset: Preset, title: string): NonNullable<StudioReport["pages"][number]["widgets"]>[string] {
    const format = { title: { text: title, enabled: true }, crossFilter: "filter" as const, triggerCrossFilter: true };
    if (preset === "decision" || preset === "policy" || preset === "settlement")
        return { type: preset === "decision" ? "decision-path" : preset === "policy" ? "policy-what-if" : "settlement-proof", dataMapping: { records: [{ id: "bounties.id" }] }, format };
    if (preset === "ledger")
        return { type: "grid", format, dataMapping: { cols: ["bounties.id", "bounties.title", "bounties.status", "bounties.rewardUsd", "bounties.auditScore", "bounties.country"].map(id => ({ id })) } };
    const category = preset === "funding" ? "bounties.status" : preset === "blocked" ? "bounties.failedCriteria" : preset === "approvals" ? "bounties.releaseMode" : "criteria.criterionId";
    const measure = preset === "funding" ? "bounties.fundedUsd" : preset === "blocked" ? "bounties.blockedUsd" : preset === "approvals" ? "bounties.rewardUsd" : "criteria.rejectedSubmissionCount";
    return { type: "bar-chart-grouped", format, dataMapping: { categoryKey: [{ id: category }], valueKey: [{ id: measure, aggregation: "sum" }] } };
}
export function initialStudioReport(): StudioReport {
    const page = (id: string, presets: [
        Preset,
        string
    ][]) => ({ id, widgets: Object.fromEntries(presets.map(([preset, title], index) => [`${id}-${index}`, presetWidget(preset, title)])), widgetLayout: Object.fromEntries(presets.map((_, index) => [`${id}-${index}`, { xTrack: index % 2 * 12, yTrack: Math.floor(index / 2) * 12, xSpan: 12, ySpan: 12 }])), layout: { columns: 24, rowHeight: 32, minWidth: 0, pagePadding: 20, widgetPadding: 16, widgetBackgroundColor: "#ffffff", backgroundColor: "#f6f8fc", widgetBorderEnabled: true, widgetBorderColor: "#dce4ee", widgetBorderWidth: 1, widgetBorderRadius: 12 } });
    return { version: "3.1.0", selectedPageId: "operations", pages: [page("operations", [["funding", "Funding by status"], ["approvals", "Approval bottlenecks"], ["decision", "Evidence to payout"], ["ledger", "Bounty ledger"]]), page("risk", [["blocked", "Value held by criterion combination"], ["criteria", "Rejected submissions by criterion"], ["policy", "Policy What-if"], ["decision", "Inspect the decision"]]), page("settlement", [["settlement", "Provider-linked receipts"], ["funding", "Funding captured"], ["ledger", "Settlement ledger"]])], panels: { ai: { collapsed: false, width: 360 } } };
}
export function reportFromStored(value: unknown): StudioReport | null {
    if (!value || typeof value !== "object" || !("pages" in value) || !Array.isArray(value.pages) || !("selectedPageId" in value) || typeof value.selectedPageId !== "string")
        return null;
    for (const page of value.pages) {
        if (!page || typeof page !== "object" || typeof page.id !== "string")
            return null;
        for (const widget of Object.values(page.widgets ?? {})) {
            if (!widget || typeof widget !== "object" || !("type" in widget) || !(STUDIO_WIDGET_TYPES as readonly unknown[]).includes(widget.type))
                return null;
        }
    }
    return value as StudioReport;
}

"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { AgStudioAiModule, createDataEngine, studioTheme, type AgDataSourcesDefinition, type AgFieldDefinition, type AgStudioApi, type AgAiHarnessSetupParams } from "ag-studio";
import type { AnalyticsSnapshot } from "@/lib/analytics-types";
import type { AppMode, LedgerRow, SessionRole } from "@/lib/types";
import { analyticsFromLedger } from "@/lib/analytics";
import { createBountyGuardHarness } from "@/lib/studio-client";
import { GuardStudioContext, guardWidgets, initialStudioReport, reportFromStored, type GuardRegistry, type StudioReport } from "./studio/definitions";
import { defaultStudioPanels, toggleStudioPanel, studioPanelConfig, type StudioPanelId } from "./studio/panels";
import "./studio/studio.css";
export type StudioWorkspaceProps = {
    rows: LedgerRow[];
    mode: AppMode;
    role: SessionRole | null;
    onInspect: (id: string) => void;
    onFilter: (ids: string[] | null) => void;
    licenseKey?: string;
};
const sourceFields = {
    bounties: ["id", "bountyId", "title", "rewardCents", "rewardUsd", "createdAt", "status", "releaseMode", "auditScore", "criteriaPassed", "criteriaTotal", "failedCriteria", "country", "sourceKind", "headSha", "fundedCents", "fundedUsd", "payoutCents", "payoutUsd", "blockedCents", "blockedUsd", "durationMs", "autoMinScore", "autoMaxCents", "funded", "approved", "riskCount"],
    audits: ["id", "bountyId", "submissionId", "status", "verdict", "score", "durationMs", "createdAt", "model"],
    criteria: ["id", "bountyId", "auditId", "submissionId", "criterionId", "passed", "result", "rejectedSubmissionCount", "feedback"],
    funding: ["id", "bountyId", "status", "amountCents", "amountUsd", "orderId", "captureId", "createdAt"],
    payouts: ["id", "bountyId", "status", "provider", "settlementMode", "amountCents", "amountUsd", "batchId", "transactionId", "createdAt"],
    events: ["id", "bountyId", "type", "message", "createdAt"],
} satisfies Record<keyof AnalyticsSnapshot["sources"], string[]>;
function dataDefinition(snapshot: AnalyticsSnapshot): AgDataSourcesDefinition {
    return { description: "Garda verified evidence and PayPal Sandbox operations. Monetary facts are one-per-bounty or operation. Simulations are labelled. Countries are contributor-reported.", sources: (Object.keys(sourceFields) as (keyof typeof sourceFields)[]).map(id => ({ id, name: id[0].toUpperCase() + id.slice(1), primaryKeyField: "id", data: snapshot.sources[id], fields: sourceFields[id].map(field => {
                const format: AgFieldDefinition["format"] = ["funded", "approved", "passed"].includes(field) ? "booleanFormat" : field === "createdAt" ? "dateTimeFormat" : field.endsWith("Usd") ? "currencyFormat" : /(Cents|Ms|Score|Count|Passed|Total)$/.test(field) || field === "score" ? "decimalFormat" : "textFormat";
                return { id: field, name: field === "country" ? "Country (self-reported)" : field === "failedCriteria" ? "Failed criterion combination" : field.replace(/([a-z])([A-Z])/g, "$1 $2"), format, ...(format === "currencyFormat" ? { formatOptions: { format: "$#,##0.00" } } : {}) };
            }) })), relationships: ["audits", "criteria", "funding", "payouts", "events"].map(id => ({ id: `bounty-${id}`, type: "one-to-many" as const, source: "bounties.id", target: `${id}.bountyId` })), options: { fanout: { execute: "prevent", warning: true } } };
}
const theme = studioTheme.withParams({ browserColorScheme: "light", accentColor: "#0070e0", backgroundColor: "#ffffff", foregroundColor: "#142c4a", borderColor: "#dce4ee", fontFamily: "var(--font-body)", fontSize: 13, studioMinWidth: 0, studioPanelMinWidth: 0, studioPanelWidth: 340, studioPanelMaxWidth: 360, studioWrapperBorderRadius: 12, studioWrapperBorder: false, studioCanvasBackgroundColor: "#f6f8fc" });
export function StudioWorkspace(props: StudioWorkspaceProps) {
    return <StudioSession key={`${props.mode}-${props.role ?? "public"}`} {...props}/>;
}
function StudioSession(props: StudioWorkspaceProps) {
    const { rows, mode, role, onInspect, onFilter, licenseKey } = props;
    const [live, setLive] = useState(!!role), [editing, setEditing] = useState(true), [snapshot, setSnapshot] = useState(() => analyticsFromLedger(rows, mode === "demo"));
    const [report, setReport] = useState<StudioReport | null>(null), [version, setVersion] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState(""), [saveMessage, setSaveMessage] = useState("");
    const [activity, setActivity] = useState("Choose a suggested prompt in the Studio assistant."), [history, setHistory] = useState({ undo: false, redo: false }), [selectedPage, setSelectedPage] = useState("operations");
    const [mobile, setMobile] = useState(false), [panelSelection, setPanelSelection] = useState(() => defaultStudioPanels(false));
    const today = new Date().toISOString().slice(0, 10), ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const [from, setFrom] = useState(ninetyDaysAgo), [to, setTo] = useState(today);
    const studioRef = useRef<AgStudio<GuardRegistry>>(null), snapshotRef = useRef(snapshot), callbacks = useRef({ onInspect, onFilter }), rangeRef = useRef({ from: from + "T00:00:00.000Z", to: to + "T23:59:59.999Z" });
    snapshotRef.current = snapshot;
    callbacks.current = { onInspect, onFilter };
    rangeRef.current = { from: from + "T00:00:00.000Z", to: to + "T23:59:59.999Z" };
    const latestReport = useRef<StudioReport>(initialStudioReport());
    const reloadAbort = useRef<AbortController | null>(null);
    const storageKey = `bountyguard-studio-v2-${mode}-${role ?? "public"}`;
    const data = useMemo(() => dataDefinition(snapshot), [snapshot]);
    const engine = useMemo(() => createDataEngine(data), []);
    useEffect(() => { engine.update?.({ sources: data.sources }); }, [engine, data]);
    useEffect(() => { setLive(!!role); }, [role]);
    useEffect(() => {
        const media = window.matchMedia("(max-width: 720px)");
        const update = () => { setMobile(media.matches); setPanelSelection(defaultStudioPanels(media.matches)); setEditing(!media.matches); };
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);
    function togglePanel(panel: StudioPanelId) {
        const current = editing ? panelSelection : defaultStudioPanels(true);
        const next = toggleStudioPanel(current, panel, mobile);
        setPanelSelection(next);
        setEditing(true);
        const api = studioRef.current?.api;
        if (api && (next.left === panel || next.right === panel)) {
            const state = api.getState();
            api.setState({ ...state, panels: { ...state.panels, [panel]: { ...state.panels?.[panel], collapsed: false, ...(mobile ? { width: Math.max(260, window.innerWidth - 58) } : {}) } } });
        }
    }
    useEffect(() => {
        let alive = true;
        setLoading(true);
        setError("");
        setSaveMessage("");
        async function load() {
            let saved: StudioReport | null = null;
            try {
                const stored = localStorage.getItem(storageKey);
                if (stored)
                    saved = reportFromStored(JSON.parse(stored));
            }
            catch {}
            if (mode === "connected" && !saved) {
                try {
                    const response = await fetch("/api/studio/report", { cache: "no-store" });
                    if (response.ok) {
                        const result = await response.json();
                        saved = reportFromStored(result.state);
                        if (alive)
                            setVersion(result.version ?? 0);
                    }
                }
                catch {}
            }
            if (alive) {
                const next = saved ?? initialStudioReport();
                latestReport.current = next;
                setReport(next);
                setLoading(false);
            }
        }
        void load();
        return () => { alive = false; };
    }, [storageKey, mode]);
    const reload = useCallback(async () => {
        reloadAbort.current?.abort();
        const controller = new AbortController();
        reloadAbort.current = controller;
        if (mode === "demo" && !live) {
            setSnapshot(analyticsFromLedger(rows, true, { from: new Date(rangeRef.current.from), to: new Date(rangeRef.current.to) }));
            setError("");
            return;
        }
        try {
            setError("");
            const query = new URLSearchParams({ ...rangeRef.current, mode });
            const response = await fetch(`/api/analytics?${query}`, { cache: "no-store", signal: controller.signal });
            const body = await response.json();
            if (!response.ok)
                throw new Error(body.error ?? "Unable to load analytics.");
            if (!controller.signal.aborted) setSnapshot(body as AnalyticsSnapshot);
        }
        catch (caught) {
            if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load analytics.");
        }
    }, [mode, live, rows]);
    useEffect(() => {
        void reload();
        const interval = setInterval(() => {
            if (document.visibilityState === "visible")
                void reload();
        }, 15000);
        const focus = () => {
            if (document.visibilityState === "visible")
                void reload();
        };
        window.addEventListener("focus", focus);
        document.addEventListener("visibilitychange", focus);
        return () => { reloadAbort.current?.abort(); clearInterval(interval); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
    }, [reload]);
    async function save() {
        const state = studioRef.current?.api.getState() ?? latestReport.current;
        try {
            if (role === "maintainer" && mode === "connected") {
                const response = await fetch("/api/studio/report", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state, version }) });
                const body = await response.json();
                if (!response.ok)
                    throw new Error(body.error ?? "Save failed.");
                setVersion(body.version);
                setSaveMessage("Workspace report saved.");
            }
            else {
                localStorage.setItem(storageKey, JSON.stringify(state));
                setSaveMessage("Your layout is saved in this browser.");
            }
        }
        catch (caught) {
            setSaveMessage(caught instanceof Error ? caught.message : "Report could not be saved.");
        }
    }
    const harness = useCallback(({ api }: AgAiHarnessSetupParams) => {
        if (!("getState" in api) || typeof api.getState !== "function" || !("setState" in api) || typeof api.setState !== "function")
            throw new Error("The Studio browser API is not ready.");
        // The public factory context narrows the browser API to its DOM-free subset.
        return createBountyGuardHarness(api as AgStudioApi, { live, mode, snapshot: () => snapshotRef.current, onInspect: id => callbacks.current.onInspect(id), onFilter: ids => callbacks.current.onFilter(ids), onActivity: setActivity, range: () => ({ from: snapshotRef.current.range.from ?? rangeRef.current.from, to: snapshotRef.current.range.to ?? rangeRef.current.to }) });
    }, [live, mode]);
    const sourceLabel = `${mode === "demo" ? "Demo data" : "PayPal Sandbox"} · ${live ? "Live AI" : "Scripted agent"}`;
    return <section className="studio-workspace" data-mobile-panel={mobile && editing && (panelSelection.left || panelSelection.right) ? "true" : undefined} aria-label="AG Studio evidence and payout analytics">
    <div className="studio-heading"><div><span className="studio-eyebrow">Evidence-to-payout Studio</span><h2>Ask the ledger. Shape the dashboard.</h2><p>Explore verified evidence, approval bottlenecks and settlement proof.</p></div><span className="studio-data-badge">{sourceLabel}</span></div>
    <div className="studio-toolbar"><div className="studio-tools"><button type="button" onClick={() => setEditing(value => !value)}>{editing ? "View report" : "Edit layout & ask AI"}</button><button type="button" disabled={!history.undo} onClick={() => studioRef.current?.api.undo()}>Undo</button><button type="button" disabled={!history.redo} onClick={() => studioRef.current?.api.redo()}>Redo</button><button type="button" onClick={() => void save()}>Save report</button><button type="button" onClick={() => { callbacks.current.onFilter(null); studioRef.current?.api.setState(initialStudioReport()); setSaveMessage("Default report restored."); }}>Reset report</button></div><label className="studio-live-toggle"><input type="checkbox" checked={live} disabled={!role} onChange={event => setLive(event.target.checked)}/>Live custom AI{!role && <small>Judge sign-in required</small>}</label></div>
    <div className="studio-panel-switcher" role="group" aria-label="Studio panels">
      <span>Tools</span>
      {([["edit", "Add widgets"], ["data", "Data"], ["ai", "AI assistant"], ["filters", "Filters"]] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={editing && (panelSelection.left === id || panelSelection.right === id)} onClick={() => togglePanel(id)}>{label}</button>)}
      {mobile && editing && (panelSelection.left || panelSelection.right) && <button type="button" onClick={() => { setPanelSelection(defaultStudioPanels(true)); setEditing(false); }}>Back to report</button>}
    </div>
    <div className="studio-date-row"><span>Bounties created</span><label>From<input type="date" value={from} onChange={event => setFrom(event.target.value)}/></label><label>To<input type="date" value={to} onChange={event => setTo(event.target.value)}/></label><button type="button" onClick={() => void reload()}>Apply range</button><time dateTime={snapshot.asOf}>Updated {new Date(snapshot.asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></div>
    {(error || saveMessage) && <p className={error ? "studio-error" : "studio-save-message"} role={error ? "alert" : "status"}>{error || saveMessage}</p>}
    <p className="studio-activity" role="status">{activity}</p>
    <nav className="studio-page-tabs" aria-label="Report pages">
      {[["operations", "Operations"], ["risk", "Risk & Policy"], ["settlement", "Settlement Proof"]].map(([id, label]) => <button type="button" key={id} aria-current={selectedPage === id ? "page" : undefined} onClick={() => {
                const api = studioRef.current?.api;
                if (api)
                    api.setState({ ...api.getState(), selectedPageId: id });
            }}>{label}</button>)}
    </nav>
    {loading || !report ? <div className="studio-loading">Loading your report…</div> :
            <GuardStudioContext.Provider value={{ snapshot, rows, demo: mode === "demo", onInspect, onFilter }}>
        <AgStudioProvider modules={[AgStudioAiModule]} licenseKey={licenseKey}>
          <div className="studio-canvas">
            <AgStudio<GuardRegistry> key={`${mode}-${role}-${live}`} ref={studioRef} data={engine} widgets={guardWidgets} initialState={latestReport.current} theme={theme} mode={editing ? "edit" : "view"} ai={harness} style={{ height: "100%", width: "100%" }} panels={studioPanelConfig(panelSelection)} layout={{ minWidth: 0 }} responsiveLayoutBreakpoints={[{ maxWidth: 720, layout: (items, state) => { let y = 0; return items.map(item => { const position = { xTrack: 0, yTrack: y, xSpan: state.columns, ySpan: Math.max(item.layout.ySpan, 10) }; y += position.ySpan; return position; }); } }]} onStudioReady={() => setActivity(live ? "Live custom AI ready. Dashboard tools cannot send payments." : "Scripted demo ready. Sign in as a judge for live AI.")} onStateUpdated={event => {
                    const next = reportFromStored(event.state);
                    if (next)
                        latestReport.current = next;
                    setSelectedPage(event.state.selectedPageId);
                    if (mobile && editing) {
                        const activePanel = panelSelection.left ?? panelSelection.right;
                        if (activePanel && event.state.panels?.[activePanel]?.collapsed)
                            setPanelSelection(defaultStudioPanels(true));
                    }
                    const api = studioRef.current?.api;
                    if (api) {
                        const changes = api.getHistory();
                        setHistory({ undo: changes.undo.length > 0, redo: changes.redo.length > 0 });
                    }
                    if (next && (mode === "demo" || role === "judge"))
                        try {
                            localStorage.setItem(storageKey, JSON.stringify(next));
                        }
                        catch {}
                }} onErrorRaised={event => {
                    if (event.fatal)
                        setError("This report could not be loaded. Reset the report to recover.");
                }}/>
          </div>
        </AgStudioProvider>
      </GuardStudioContext.Provider>}
    <p className="studio-fine-print">Data-bound custom widgets and AG Studio’s native agents. What-if scenarios never change policy or move money. All provider operations use PayPal Sandbox.</p>
  </section>;
}

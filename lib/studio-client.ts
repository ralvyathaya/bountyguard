"use client";
import { createAiHarness, clientToolRunner, type AgAiAgentDefinition, type AgAiEvent, type AgAiEventStream, type AgAiHarness, type AgAiRunInput, type AgAiTool, type AgStudioApi } from "ag-studio";
import { z } from "zod";
import type { AnalyticsSnapshot } from "./analytics-types";
import { queryStudioData, simulateStudioPolicy, studioToolDefinitions, validateStudioTool, scriptedWidgetCalls, type StudioToolName, type StudioEnvelope } from "./studio-tools";
import { presetWidget, type StudioReport } from "@/components/studio/definitions";
const eventSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("TEXT_MESSAGE_START"), messageId: z.string(), role: z.literal("assistant") }),
    z.object({ type: z.literal("TEXT_MESSAGE_CONTENT"), messageId: z.string(), delta: z.string() }),
    z.object({ type: z.literal("TEXT_MESSAGE_END"), messageId: z.string() }),
    z.object({ type: z.literal("TOOL_CALL_START"), toolCallId: z.string(), toolCallName: z.string() }),
    z.object({ type: z.literal("TOOL_CALL_ARGS"), toolCallId: z.string(), delta: z.string() }),
    z.object({ type: z.literal("TOOL_CALL_END"), toolCallId: z.string() }),
    z.object({ type: z.literal("RUN_ERROR"), message: z.string(), code: z.string().optional() }),
]);
type HarnessOptions = {
    live: boolean;
    mode: "demo" | "connected";
    snapshot: () => AnalyticsSnapshot;
    onInspect: (id: string) => void;
    onFilter: (ids: string[] | null) => void;
    onActivity: (text: string) => void;
    range: () => {
        from?: string;
        to?: string;
    };
};
export function studioTurnPayload(input: AgAiRunInput, agentId: string, mode: HarnessOptions["mode"], range: ReturnType<HarnessOptions["range"]>) {
    return {
        // Studio 3.1 suffixes each HTTP round; persistence and delegation share the logical run.
        runId: input.runId.replace(/-r\d+$/, ""), agentId, parentRunId: input.parentRunId, parentToolCallId: input.parentToolCallId,
        dataMode: mode,
        messages: input.messages.flatMap<{ role: "user" | "tool"; content: string; toolCallId?: string }>(message => message.role === "user" ? [{ role: message.role, content: message.content }] : message.role === "tool" ? [{ role: message.role, content: message.content, toolCallId: message.toolCallId }] : []).slice(-60),
        ...range,
    };
}
function envelopeEvents(envelope: StudioEnvelope): AgAiEvent[] {
    const events: AgAiEvent[] = [];
    if (envelope.text) {
        const messageId = crypto.randomUUID();
        events.push({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" }, { type: "TEXT_MESSAGE_CONTENT", messageId, delta: envelope.text }, { type: "TEXT_MESSAGE_END", messageId });
    }
    for (const call of envelope.toolCalls) {
        const toolCallId = crypto.randomUUID();
        events.push({ type: "TOOL_CALL_START", toolCallId, toolCallName: call.name }, { type: "TOOL_CALL_ARGS", toolCallId, delta: JSON.stringify(call.args) }, { type: "TOOL_CALL_END", toolCallId });
    }
    return events;
}
function scriptEnvelope(input: AgAiRunInput, agentId: string, snapshot: AnalyticsSnapshot): StudioEnvelope {
    const prompt = input.messages.filter(message => message.role === "user").at(-1)?.content ?? "";
    const afterTool = input.messages.at(-1)?.role === "tool";
    const text = prompt.toLowerCase();
    if (afterTool) {
        if (agentId !== "bountyguard" && agentId !== "lead")
            return { text: "", toolCalls: [{ name: "complete_task", args: { summary: "Created the requested, data-bound dashboard visualizations. The public run uses scripted orchestration and fixture data.", artifacts: [] } }] };
        if (agentId === "lead")
            return { text: "", toolCalls: [{ name: "complete_task", args: { summary: "The Studio Widget agent created the requested report widgets from demo facts.", artifacts: [] } }] };
        return { text: "The report has been updated using the current demo fixtures. You can cross-filter the chart, inspect its bounties, and undo the layout change. This public agent is scripted; sign in with judge access to ask the live custom model.", toolCalls: [] };
    }
    if (agentId === "bountyguard") {
        if (text.includes("why") || text.includes("evidence")) {
            const bounty = snapshot.sources.bounties.find(row => row.status === "REVISION_REQUIRED") ?? snapshot.sources.bounties[0];
            return { text: "I’ll open the recorded evidence and policy decision. This is navigation only.", toolCalls: bounty ? [{ name: "guard_open_bounty", args: { bountyId: String(bounty.id) } }] : [] };
        }
        if (text.includes("$100") || text.includes("what changes") || text.includes("simulate"))
            return { text: "I’ll compare a hypothetical $100 auto-release limit. Actual release settings stay unchanged.", toolCalls: [{ name: "guard_simulate_policy", args: { minimumScore: 90, maximumUsd: 100 } }, { name: "guard_add_widget", args: { preset: "policy", title: "Policy What-if", pageId: "risk" } }] };
        return { text: "I’ll ask Studio’s Lead agent to compose a widget from the financial facts.", toolCalls: [{ name: "delegate_to", args: { type: { id: "lead" }, instructions: prompt || "Show blocked value by failed criterion." } }] };
    }
    if (agentId === "lead")
        return { text: "Delegating the configured visualization to Studio’s Widget agent.", toolCalls: [{ name: "delegate_to", args: { type: { id: "widget" }, instructions: prompt || "Show blocked value." } }] };
    return { text: "Adding the requested data-bound visualizations to the report.", toolCalls: scriptedWidgetCalls(prompt) };
}
export function createBountyGuardHarness(api: AgStudioApi, options: HarnessOptions): AgAiHarness {
    const execute = (name: StudioToolName, args: Record<string, unknown>, agentId: string) => {
        const checked = validateStudioTool(name, args), snapshot = options.snapshot();
        options.onActivity(`${name.replaceAll("guard_", "").replaceAll("_", " ")} · dashboard tools only`);
        if (name === "guard_view_data")
            return { asOf: snapshot.asOf, summary: snapshot.summary, sources: Object.fromEntries(Object.entries(snapshot.sources).map(([source, rows]) => [source, { rowCount: rows.length, fields: Object.keys(rows[0] ?? {}) }])) };
        if (name === "guard_query")
            return queryStudioData(snapshot, checked);
        if (name === "guard_simulate_policy")
            return simulateStudioPolicy(snapshot, checked);
        if (name === "guard_view_report") {
            const state = api.getState();
            return { selectedPageId: state.selectedPageId, pages: state.pages.map(page => ({ id: page.id, widgets: Object.entries(page.widgets ?? {}).map(([id, widget]) => ({ id, type: widget?.type })) })) };
        }
        if (name === "guard_open_bounty") {
            const id = String(checked.bountyId);
            if (!snapshot.sources.bounties.some(row => row.id === id))
                throw new Error("Bounty is outside this data source.");
            options.onInspect(id);
            return { opened: id, financialAction: false };
        }
        if (name === "guard_filter_bounties") {
            const ids = snapshot.sources.bounties.filter(row => row.status === checked.status).map(row => String(row.id));
            options.onFilter(ids);
            return { matchingBountyIds: ids, financialAction: false };
        }
        if (name === "guard_add_widget") {
            const preset = checked.preset;
            const state = api.getState() as StudioReport;
            const pageId = String(checked.pageId ?? state.selectedPageId), page = state.pages.find(item => item.id === pageId);
            if (!page)
                throw new Error("Report page not found.");
            const widgetId = `guard-${crypto.randomUUID()}`;
            const yTrack = Math.max(0, ...Object.values(page.widgetLayout ?? {}).flatMap(position => position ? [position.yTrack + position.ySpan] : []));
            const widget = presetWidget(preset as Parameters<typeof presetWidget>[0], String(checked.title));
            const next: StudioReport = { ...state, selectedPageId: page.id, pages: state.pages.map(item => item.id === page.id ? { ...item, widgets: { ...item.widgets, [widgetId]: widget }, widgetLayout: { ...item.widgetLayout, [widgetId]: { xTrack: 0, yTrack, xSpan: 12, ySpan: 12 } } } : item) };
            api.setState(next as ReturnType<AgStudioApi["getState"]>, { source: { type: "ai", agent: agentId }, historyLabel: "Add BountyGuard widget" });
            return { widgetId, pageId: page.id, preset, title: checked.title, created: true };
        }
        throw new Error("Tool is not registered.");
    };
    const customTools = (agentId: string): AgAiTool[] => studioToolDefinitions(agentId).filter(tool => tool.name !== "delegate_to" && tool.name !== "complete_task").map(definition => ({ name: definition.name, description: definition.description, kind: "client", schema: () => ({ ...definition, kind: "client" }), execute: async (call, context) => {
            try {
                return context.success("Dashboard operation completed.", execute(definition.name, call.args, agentId));
            }
            catch (error) {
                return context.error(error instanceof Error ? error.message : "Dashboard operation failed.");
            }
        } }));
    return createAiHarness(api, ({ tools, builtIn }) => {
        const makeRunner = (base: AgAiAgentDefinition, agentId: string) => clientToolRunner({
            ...base, id: agentId, maxTurns: 8, schema: s => s.undefined(), defaultToolCalls: () => [],
            tools: () => [...customTools(agentId), ...(agentId === "bountyguard" || agentId === "lead" ? [tools.delegateTo(agentId === "bountyguard" ? ["lead", "data", "planning", "page", "widget"] : ["data", "planning", "page", "widget"])] : [])],
            run: async function* (input, ctx): AgAiEventStream {
                options.onActivity(`${options.live ? "Live model" : "Scripted demo"} · ${base.name ?? agentId}`);
                if (!options.live) {
                    for (const event of envelopeEvents(scriptEnvelope(input, agentId, options.snapshot())))
                        yield event;
                    return;
                }
                try {
                    const response = await fetch("/api/studio/turn", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctx.signal, body: JSON.stringify(studioTurnPayload(input, agentId, options.mode, options.range())) });
                    if (!response.ok) {
                        const error: unknown = await response.json();
                        throw new Error(error && typeof error === "object" && "error" in error ? String(error.error) : "The live AI request failed.");
                    }
                    const body = await response.text();
                    for (const line of body.split("\n").filter(Boolean))
                        yield eventSchema.parse(JSON.parse(line));
                }
                catch (error) {
                    if (!ctx.signal?.aborted)
                        yield { type: "RUN_ERROR", message: error instanceof Error ? error.message : "The live AI request failed. No payment was authorized." };
                }
            },
        });
        return { primary: "bountyguard", agents: [makeRunner({ id: "bountyguard", name: "BountyGuard", description: "Evidence and payment-policy coordinator. Analytics and dashboard tools only." }, "bountyguard"), ...(["lead", "data", "page", "planning", "widget"] as const).map(id => makeRunner(builtIn[id], id))], promptStarters: [{ label: "Build a risk dashboard", prompt: "Build a dashboard showing funded rewards, blocked value, and approval bottlenecks." }, { label: "Explain blocked work", prompt: "Why is this bounty blocked? Show the evidence." }, { label: "Simulate a $100 limit", prompt: "What changes if the auto-release limit becomes $100?" }, { label: "Inspect failed criteria", prompt: "Show rejected submissions by failed acceptance criterion." }] };
    });
}

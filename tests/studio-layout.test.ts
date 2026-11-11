import test from "node:test";
import assert from "node:assert/strict";
import { defaultStudioPanels, toggleStudioPanel, studioPanelConfig } from "../components/studio/panels";
import { scriptedWidgetCalls } from "../lib/studio-tools";
test("desktop starts with one AI panel and mobile starts with an unobstructed report", () => {
    assert.deepEqual(studioPanelConfig(defaultStudioPanels(false)).edit, { left: [], right: ["ai"] });
    assert.deepEqual(studioPanelConfig(defaultStudioPanels(true)).edit, { left: [], right: [] });
});
test("each side has one panel and mobile switches to a single full-width panel", () => {
    const data = toggleStudioPanel(defaultStudioPanels(false), "data", false);
    assert.deepEqual(toggleStudioPanel(data, "edit", false), { left: "edit", right: "ai" });
    const mobileData = toggleStudioPanel(defaultStudioPanels(true), "data", true);
    assert.deepEqual(toggleStudioPanel(mobileData, "ai", true), { left: null, right: "ai" });
    assert.deepEqual(toggleStudioPanel({ left: null, right: "ai" }, "ai", true), { left: null, right: null });
});
test("the full scripted risk request builds all three requested metrics", () => {
    assert.deepEqual(scriptedWidgetCalls("Build a dashboard showing funded rewards, blocked value, and approval bottlenecks.").map(call => call.args.preset), ["funding", "blocked", "approvals"]);
});

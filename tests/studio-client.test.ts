import test from "node:test";
import assert from "node:assert/strict";
import { clientToolRunner, type AgAiRunInput } from "ag-studio";
import { studioTurnPayload } from "../lib/studio-client";

test("native Studio rounds retain one server run, tool results, and delegation parent", async () => {
  const input: AgAiRunInput = { threadId: "child-thread", runId: "child-run", parentRunId: "parent-run", parentToolCallId: "delegation", messages: [{ id: "prompt", role: "user", content: "Inspect the report." }], tools: [], state: {}, context: [], forwardedProps: {} };
  const requests: ReturnType<typeof studioTurnPayload>[] = [];
  const tool = { name: "guard_view_report", kind: "client" as const, description: "Inspect report", schema: () => ({ name: "guard_view_report", description: "Inspect report", parameters: { type: "object", properties: {} }, kind: "client" as const }), execute: async () => ({ success: true as const, response: "Report inspected." }) };
  const runner = clientToolRunner({ id: "lead", maxTurns: 3, run: async function* (round) {
    requests.push(studioTurnPayload(round, "lead", "demo", {}));
    if (requests.length === 1) {
      yield { type: "TOOL_CALL_START", toolCallId: "inspect", toolCallName: tool.name };
      yield { type: "TOOL_CALL_ARGS", toolCallId: "inspect", delta: "{}" };
      yield { type: "TOOL_CALL_END", toolCallId: "inspect" };
    }
  } });
  for await (const event of runner.run(input, { params: undefined, instructions: () => "Inspect only.", tools: () => [tool] })) {
    assert.notEqual(event.type, "RUN_ERROR");
  }
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(request => request.runId), ["child-run", "child-run"]);
  assert.ok(requests[1].messages.some(message => message.role === "tool" && message.toolCallId === "inspect"));
  assert.ok(requests.every(request => request.parentRunId === "parent-run" && request.parentToolCallId === "delegation"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { requestStudioEnvelope } from "../lib/studio-agent";

test("Chat-only gateways receive the complete runtime contract in the final user turn, including repair",async()=>{
  const original=globalThis.fetch;
  Object.assign(process.env,{OPENAI_API_KEY:"test-key",OPENAI_BASE_URL:"https://provider.example/v1",OPENAI_MODEL:"test-model"});
  let calls=0,reservations=0;
  globalThis.fetch=async (_input,init)=>{
    const body=JSON.parse(String(init?.body));
    const last=body.messages.at(-1);
    assert.equal(last.role,"user");
    assert.match(last.content,/ALLOWED TOOLS/);
    assert.match(last.content,/TRUSTED SERVER DATA/);
    assert.match(last.content,/delegate_to/);
    calls++;
    return Response.json({choices:[{message:{role:"assistant",content:calls===1?'{"name":"wrong"}':'{"text":"Ready","toolCalls":[]}'},finish_reason:"stop"}]});
  };
  try{
    const result=await requestStudioEnvelope("bountyguard",[{role:"user",content:"Add a funding chart."}],{source:"Demo"},async()=>{reservations++;});
    assert.equal(result.text,"Ready");
    assert.equal(calls,2);
    assert.equal(reservations,2);
  }finally{globalThis.fetch=original;}
});

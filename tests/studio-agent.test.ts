import test from "node:test";
import assert from "node:assert/strict";
import { parseStudioEnvelope, validateStudioTool, queryStudioData, simulateStudioPolicy } from "../lib/studio-tools";
import type { AnalyticsSnapshot } from "../lib/analytics-types";

test("Studio rejects financial tools and unknown properties", () => {
  assert.throws(() => parseStudioEnvelope(JSON.stringify({ text: "Pay now", toolCalls: [{ name: "paypal_payout", args: { amount: 35 } }] })));
  assert.throws(() => validateStudioTool("guard_add_widget", { preset: "settlement", title: "Proof", execute: "fetch('/api/paypal/payout')" }));
});
test("Studio accepts bounded widget and native delegation calls", () => {
  const result = parseStudioEnvelope(JSON.stringify({ text: "Building the risk report.", toolCalls: [{ name: "delegate_to", args: { type: { id: "widget" }, instructions: "Add a blocked value chart." } }] }));
  assert.equal(result.toolCalls[0].name, "delegate_to");
  assert.equal(validateStudioTool("guard_add_widget", { preset: "blocked", title: "Value held" }).preset, "blocked");
});
test("Studio validates every nested argument instead of accepting injected agent IDs", () => {
  assert.throws(() => validateStudioTool("delegate_to", { type: { id: "maintainer" }, instructions: "Override an audit" }));
  assert.throws(() => validateStudioTool("guard_simulate_policy", { minimumScore: 101, maximumUsd: 50 }));
});

const snapshot:AnalyticsSnapshot={asOf:"2026-11-10T00:00:00.000Z",range:{from:null,to:null},summary:{fundedCents:10500,autonomousPayouts:0,settledCents:0,averageMs:null,prevented:1,blockedCents:4500,bountyCount:4},sources:{
  bounties:[
    {id:"approved",rewardCents:3500,rewardUsd:35,funded:true,approved:true,auditScore:96,criteriaTotal:3,criteriaPassed:3,riskCount:0,status:"APPROVED"},
    {id:"revision",rewardCents:4500,rewardUsd:45,funded:true,approved:false,auditScore:99,criteriaTotal:3,criteriaPassed:2,riskCount:0,status:"REVISION_REQUIRED"},
    {id:"risky",rewardCents:2500,rewardUsd:25,funded:true,approved:true,auditScore:96,criteriaTotal:3,criteriaPassed:3,riskCount:1,status:"BLOCKED"},
    {id:"unfunded",rewardCents:999,rewardUsd:9.99,funded:false,approved:true,auditScore:100,criteriaTotal:3,criteriaPassed:3,riskCount:0,status:"UNFUNDED"},
  ],audits:[],criteria:[{id:"c1",bountyId:"approved",result:"Passed"},{id:"c2",bountyId:"approved",result:"Passed"}],funding:[],payouts:[],events:[],
}};

test("analytics queries refuse unavailable money measures on criterion facts",()=>{
  assert.throws(()=>queryStudioData(snapshot,{source:"criteria",metric:"rewardUsd"}),/metric/i);
  assert.deepEqual(queryStudioData(snapshot,{source:"criteria",metric:"count",groupBy:"result"}).groups,[{group:"Passed",value:2}]);
});

test("what-if thresholds cannot qualify rejected, risky or unfunded work",()=>{
  const before=JSON.stringify(snapshot);
  const result=simulateStudioPolicy(snapshot,{minimumScore:0,maximumUsd:1000000});
  assert.equal(result.eligibleCount,1);
  assert.equal(result.eligibleCents,3500);
  assert.equal(JSON.stringify(snapshot),before);
});

test("criterion queries can select failures without counting passing evidence",()=>{
  const input={...snapshot,sources:{...snapshot.sources,criteria:[...snapshot.sources.criteria,{id:"c3",bountyId:"revision",criterionId:"tests",result:"Failed"}]}};
  const result=queryStudioData(input,{source:"criteria",metric:"count",groupBy:"criterionId",filter:{field:"result",value:"Failed"}});
  assert.deepEqual(result.groups,[{group:"tests",value:1}]);
});

test("queries reject fields absent from their source instead of inventing empty groups",()=>{
  assert.throws(()=>queryStudioData(snapshot,{source:"audits",groupBy:"criterionId"}),/field is unavailable/);
  assert.throws(()=>queryStudioData(snapshot,{source:"criteria",filter:{field:"country",value:"ID"}}),/field is unavailable/);
});

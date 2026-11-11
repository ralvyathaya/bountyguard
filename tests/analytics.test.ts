import test from "node:test";
import assert from "node:assert/strict";
import { analyticsFromLedger, analyticsForRole } from "../lib/analytics";
import { createDemoRows, completeDemoAudit } from "../lib/demo";
test("financial measures stay at one fact per bounty despite multiple criteria",()=>{
  const rows=createDemoRows();
  rows[1]=completeDemoAudit(rows[1],58,true);
  const snapshot=analyticsFromLedger(rows,true);
  assert.equal(snapshot.sources.bounties.length,rows.length);
  assert.ok(snapshot.sources.criteria.length>snapshot.sources.bounties.length);
  assert.equal(snapshot.summary.fundedCents,rows.reduce((sum,r)=>sum+(r.funding?.status==="COMPLETED"?r.funding.amountCents:0),0));
  assert.equal(snapshot.summary.blockedCents,rows.filter(r=>r.funding?.status==="COMPLETED"&&r.audit?.verdict?.status==="REVISION_REQUIRED").reduce((sum,r)=>sum+r.rewardCents,0));
});
test("simulation receipts never count as actual autonomous payouts",()=>{
  assert.ok(analyticsFromLedger(createDemoRows(),true).summary.autonomousPayouts>0);
  assert.equal(analyticsFromLedger(createDemoRows(),false).summary.autonomousPayouts,0);
});

test("judge analytics removes private historical prose before browser and model access",()=>{
  const snapshot=analyticsFromLedger(createDemoRows(),true);
  snapshot.sources.criteria[0].feedback="private-receiver@example.com: raw deliverable snippet";
  snapshot.sources.events[0].message="private-receiver@example.com: quoted audit evidence";
  const judge=analyticsForRole(snapshot,"judge");
  assert.doesNotMatch(JSON.stringify(judge),/private-receiver|raw deliverable snippet|quoted audit evidence/);
  assert.match(JSON.stringify(analyticsForRole(snapshot,"maintainer")),/private-receiver/);
  assert.deepEqual(judge.summary,snapshot.summary);
});

test("fixture date cohorts filter every source and preserve an explicit snapshot range",()=>{
  const rows=createDemoRows();
  const from=new Date("2026-01-01T00:00:00Z"),to=new Date("2026-01-02T00:00:00Z");
  const snapshot=analyticsFromLedger(rows,true,{from,to});
  assert.equal(snapshot.summary.bountyCount,0);
  assert.ok(Object.values(snapshot.sources).every(source=>source.length===0));
  assert.deepEqual(snapshot.range,{from:from.toISOString(),to:to.toISOString()});
});

test("failed criterion measures attribute rejected submissions without duplicating money",()=>{
  const rows=[completeDemoAudit(createDemoRows()[1],58,true)];
  const snapshot=analyticsFromLedger(rows,true);
  assert.deepEqual(snapshot.sources.criteria.map(row=>[row.criterionId,row.rejectedSubmissionCount]),[["implementation",0],["tests",1],["documentation",0]]);
  assert.equal(snapshot.summary.blockedCents,4500);
});

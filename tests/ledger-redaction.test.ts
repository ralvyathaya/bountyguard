import test from "node:test";
import assert from "node:assert/strict";
import { redactLedgerRow } from "../lib/ledger";
import { createDemoRows, completeDemoAudit } from "../lib/demo";

test("judge ledger and receipt projection cannot expose quoted raw deliverables",()=>{
  const row=completeDemoAudit(createDemoRows()[1],58,true);
  const privateText="private-deliverable-sentinel with no email";
  row.submission!.deliverable=privateText;
  row.audit!.verdict!.reasoning=privateText;
  row.audit!.verdict!.criteriaBreakdown[0].evidence=privateText;
  row.audit!.verdict!.criteriaBreakdown[0].feedback=privateText;
  row.audit!.verdict!.riskFlags=[privateText];
  row.audit!.error=privateText;
  row.events[0].message=privateText;
  const judge=redactLedgerRow(row,"judge");
  assert.doesNotMatch(JSON.stringify(judge),/private-deliverable-sentinel/);
  assert.equal(judge.audit?.verdict?.score,row.audit!.verdict!.score);
  assert.deepEqual(judge.audit?.verdict?.criteriaBreakdown.map(item=>item.passed),row.audit!.verdict!.criteriaBreakdown.map(item=>item.passed));
  assert.match(JSON.stringify(redactLedgerRow(row,"maintainer")),/private-deliverable-sentinel/);
});

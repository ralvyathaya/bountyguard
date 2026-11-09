import assert from "node:assert/strict";
import test from "node:test";
import { createDemoRows, completeDemoAudit, releaseDemo } from "../lib/demo";
import { isReleased, ledgerKpis, rowStatus } from "../lib/policy";

test("the three judge paths produce auto-release, rejection, and a human gate", () => {
  const rows = createDemoRows();
  const a = completeDemoAudit(rows[0], 96);
  assert.equal(a.payout?.status, "SIMULATED");
  assert.equal(a.payout?.settlementMode, "AUTO");
  assert.equal(a.rewardCents, 3500);
  assert.equal(a.audit?.verdict?.score, 96);
  const b = completeDemoAudit(rows[1], 58, true);
  assert.equal(rowStatus(b), "REVISION_REQUIRED");
  assert.equal(b.payout, null);
  assert.equal(releaseDemo(b, "HUMAN").payout, null);
  const c = completeDemoAudit(rows[2], 92);
  assert.equal(rowStatus(c), "AWAITING_APPROVAL");
  assert.equal(c.payout, null);
  assert.equal(releaseDemo(c, "HUMAN").payout?.settlementMode, "HUMAN");
});
test("simulation receipts never count as real autonomous payouts", () => {
  const rows = createDemoRows();
  assert.ok(ledgerKpis(rows, true).autonomousPayouts > 0);
  assert.equal(ledgerKpis(rows, false).autonomousPayouts, 0);
  assert.equal(isReleased(rows[3], true), true);
  assert.equal(isReleased(rows[3], false), false);
});

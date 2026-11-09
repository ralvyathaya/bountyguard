import assert from "node:assert/strict";
import test from "node:test";
import { decideRelease, dollarsToCents, safeCsvValue } from "../lib/policy";

const eligible = {
  rewardCents: 5000,
  autoMaxCents: 5000,
  autoMinScore: 90,
  funded: true,
  submissionId: "s1",
  currentSubmissionId: "s1",
  receiverEmail: "dev@example.test",
  auditedReceiverEmail: "dev@example.test",
  score: 90,
  status: "APPROVED" as const,
  criteriaPassed: true,
  riskFlags: [] as string[],
};

test("release policy includes the exact $50 / 90 boundary", () => {
  assert.equal(decideRelease(eligible), "AUTO");
  assert.equal(decideRelease({ ...eligible, rewardCents: 5001 }), "HUMAN");
  assert.equal(decideRelease({ ...eligible, score: 89 }), "HUMAN");
});

test("no release for unfunded, stale, changed receiver, rejected, or risky submissions", () => {
  for (const patch of [
    { funded: false },
    { currentSubmissionId: "s2" },
    { receiverEmail: "changed@example.test" },
    { status: "REVISION_REQUIRED" as const },
    { riskFlags: ["Unverifiable evidence"] },
    { criteriaPassed: false },
  ])
    assert.equal(decideRelease({ ...eligible, ...patch }), "BLOCKED");
});

test("money parsing rejects precision loss and invalid amounts", () => {
  assert.equal(dollarsToCents("35.01"), 3501);
  assert.equal(dollarsToCents("0.29"), 29);
  for (const value of ["1.001", "-1", "0", "1e3", "NaN", "1000001"]) {
    assert.throws(() => dollarsToCents(value));
  }
});

test("CSV neutralizes formula prefixes including leading whitespace", () => {
  for (const value of [
    "=SUM(A1)",
    "+cmd",
    "-cmd",
    "@cmd",
    "\t=cmd",
    "  =cmd",
    "\rcmd",
  ]) {
    assert.ok(safeCsvValue(value).startsWith("'"));
  }
  assert.equal(safeCsvValue("Normal task"), "Normal task");
});

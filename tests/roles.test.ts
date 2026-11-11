import test from "node:test";
import assert from "node:assert/strict";
import { createSession, sessionCookie, getSession, requireMaintainer, requireViewer, validSession } from "../lib/auth";

process.env.SESSION_SECRET = "roles-test-secret-with-more-than-thirty-two-characters";
test("judge can read but cannot authorize financial mutations", () => {
  const token = createSession(Date.now(), "judge");
  const request = new Request("https://bountyguard.example/api/bounties", { headers: { cookie: sessionCookie(token) } });
  assert.equal(getSession(request)?.role, "judge");
  assert.doesNotThrow(() => requireViewer(request));
  assert.throws(() => requireMaintainer(request), (error: unknown) => error instanceof Error && "status" in error && error.status === 403);
});
test("session role and version are authenticated", () => {
  const token = createSession(Date.now(), "judge");
  assert.equal(validSession(token.replace(".judge.", ".maintainer.")), false);
  assert.equal(validSession("2000000000." + "a".repeat(32) + ".old-signature"), false);
});

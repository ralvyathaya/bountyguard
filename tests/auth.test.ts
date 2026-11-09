import assert from "node:assert/strict";
import test from "node:test";
import {
  checkOrigin,
  createSession,
  validSession,
  hasSession,
} from "../lib/auth";
import { api, readBody } from "../lib/api";
import { bountyIdSchema } from "../lib/validation";

process.env.SESSION_SECRET = "test-session-secret-at-least-32-characters-long";
test("signed sessions reject tampering, expiry, malformed and excessive lifetimes", () => {
  const now = Date.now();
  const token = createSession(now);
  assert.ok(validSession(token, now));
  assert.equal(validSession(`${token}modified`, now), false);
  assert.equal(validSession(token, now + 9 * 3600000), false);
  assert.equal(validSession("bad.token", now), false);
  assert.equal(validSession(token, now - 9 * 3600000), false);
});
test("connected API refuses an unauthenticated request before reading data", async () => {
  let called = false;
  const response = await api(async () => {
    called = true;
    return { secret: "never returned" };
  })(new Request("https://bountyguard.example/api/bounties"));
  assert.equal(response.status, 401);
  assert.equal(called, false);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});
test("cross-origin POSTs are rejected even with a valid session", async () => {
  const request = new Request("https://bountyguard.example/api/paypal/payout", {
    method: "POST",
    headers: {
      Origin: "https://attacker.example",
      Cookie: `bountyguard_session=${createSession()}`,
    },
  });
  assert.ok(hasSession(request));
  assert.throws(() => checkOrigin(request), /same-origin/);
  const response = await api(async () => ({ paid: true }))(request);
  assert.equal(response.status, 403);
});

test("same-origin POSTs work when Next.js uses an internal request URL", () => {
  const request = new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000" },
  });
  assert.doesNotThrow(() => checkOrigin(request));
});
test("JSON boundaries reject unknown payment properties and oversized bodies", async () => {
  const req = (body: string) =>
    new Request("https://bountyguard.example/api/paypal/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  await assert.rejects(
    readBody(
      req(JSON.stringify({ bountyId: "b1", amount: 1 })),
      bountyIdSchema,
    ),
  );
  await assert.rejects(
    readBody(
      req(JSON.stringify({ bountyId: "x".repeat(140000) })),
      bountyIdSchema,
    ),
    /128 KiB/,
  );
});

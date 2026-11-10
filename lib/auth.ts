import {
  createHmac,
  randomBytes,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { AppError, requiredEnv } from "./errors";
import { db } from "./db";
import type { SessionRole } from "./types";

const COOKIE = "bountyguard_session";
const TTL = 8 * 60 * 60;
function secret() {
  const value = requiredEnv("SESSION_SECRET");
  if (value.length < 32)
    throw new AppError(
      503,
      "SESSION_SECRET must contain at least 32 characters.",
      "SETUP_REQUIRED",
    );
  return value;
}
function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}
function equal(a: string, b: string) {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
export function createSession(now = Date.now(), role: SessionRole = "maintainer") {
  const payload = `v2.${Math.floor(now / 1000) + TTL}.${randomBytes(16).toString("hex")}.${role}`;
  return `${payload}.${sign(payload)}`;
}
export function validSession(token: string, now = Date.now()): boolean {
  const parts = token.split(".");
  if (parts.length !== 5) return false;
  const [version, expires, nonce, role, signature] = parts;
  const expiry = Number(expires);
  if (
    version !== "v2" || !["maintainer", "judge"].includes(role) || !Number.isInteger(expiry) ||
    expiry <= Math.floor(now / 1000) ||
    expiry > Math.floor(now / 1000) + TTL ||
    !/^[a-f0-9]{32}$/.test(nonce)
  )
    return false;
  return equal(signature, sign(`${version}.${expires}.${nonce}.${role}`));
}
export function getSession(request: Request): { role: SessionRole; sessionHash: string } | null {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!token || !validSession(token)) return null;
  return { role: token.split(".")[3] as SessionRole, sessionHash: createHash("sha256").update(token).digest("hex") };
}
export function hasSession(request: Request) {
  return !!getSession(request);
}
export function requireViewer(request: Request) {
  const session = getSession(request);
  if (!session) throw new AppError(401, "Sign in with maintainer or judge access.", "UNAUTHORIZED");
  return session;
}
export function requireMaintainer(request: Request) {
  const session = requireViewer(request);
  if (session.role !== "maintainer") throw new AppError(403, "Judge access cannot change financial records.", "FORBIDDEN");
  return session;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  let valid = false;
  if (origin) {
    try {
      const parsed = new URL(origin);
      // Next.js may normalize the internal URL; Host identifies the browser-facing destination.
      const host = request.headers.get("host") ?? new URL(request.url).host;
      valid =
        ["http:", "https:"].includes(parsed.protocol) &&
        parsed.origin === origin &&
        parsed.host === host;
    } catch {
      valid = false;
    }
  }
  if (!valid)
    throw new AppError(
      403,
      "This action requires a same-origin request.",
      "INVALID_ORIGIN",
    );
}
export function sessionCookie(token: string, clear = false) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : TTL}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export async function login(password: string, role: SessionRole = "maintainer") {
  const setting = role === "judge" ? "JUDGE_PASSWORD" : "MAINTAINER_PASSWORD";
  const expected = requiredEnv(setting);
  if (expected.length < 16)
    throw new AppError(
      503,
      `${setting} must contain at least 16 characters.`,
      "SETUP_REQUIRED",
    );
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60000);
  // A global bucket also bounds attempts from distributed IPs in serverless.
  const key = `login:${role}:${Math.floor(now.getTime() / (15 * 60000))}`;
  const bucket = await db().loginLimit.upsert({
    where: { key },
    create: { key, expiresAt },
    update: { attempts: { increment: 1 } },
  });
  if (bucket.attempts > 10)
    throw new AppError(
      429,
      "Too many login attempts. Try again after 15 minutes.",
      "RATE_LIMITED",
    );
  if (!equal(password, expected))
    throw new AppError(401, "Incorrect maintainer password.", "UNAUTHORIZED");
  const token = createSession(Date.now(), role);
  await db().loginLimit.deleteMany({ where: { expiresAt: { lt: now } } });
  return sessionCookie(token);
}

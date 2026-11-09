import {
  createHmac,
  randomBytes,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { AppError, requiredEnv } from "./errors";
import { db } from "./db";

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
export function createSession(now = Date.now()) {
  const payload = `${Math.floor(now / 1000) + TTL}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${sign(payload)}`;
}
export function validSession(token: string, now = Date.now()): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expires, nonce, signature] = parts;
  const expiry = Number(expires);
  if (
    !Number.isInteger(expiry) ||
    expiry <= Math.floor(now / 1000) ||
    expiry > Math.floor(now / 1000) + TTL ||
    !/^[a-f0-9]{32}$/.test(nonce)
  )
    return false;
  return equal(signature, sign(`${expires}.${nonce}`));
}
export function hasSession(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  return !!token && validSession(token);
}
export function requireMaintainer(request: Request) {
  if (!hasSession(request))
    throw new AppError(
      401,
      "Unlock Sandbox Connected with your maintainer password.",
      "UNAUTHORIZED",
    );
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
export async function login(password: string) {
  const expected = requiredEnv("MAINTAINER_PASSWORD");
  if (expected.length < 16)
    throw new AppError(
      503,
      "MAINTAINER_PASSWORD must contain at least 16 characters.",
      "SETUP_REQUIRED",
    );
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60000);
  // A global bucket also bounds attempts from distributed IPs in serverless.
  const key = `login:${Math.floor(now.getTime() / (15 * 60000))}`;
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
  const token = createSession();
  await db().loginLimit.deleteMany({ where: { expiresAt: { lt: now } } });
  return sessionCookie(token);
}

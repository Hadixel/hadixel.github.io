// One session implementation, for customers and for operators.
//
// Both realms had their own: a token, a SHA-256 of it in a row, a cookie, and a revocation. The
// storefront's logout route then re-implemented the revocation — its own hash, its own update — because
// the auth module did not expose one. Two copies of "revoke this session" is two places for a session
// to survive a sign-out, and the copy in the route handler was the one that ran.
//
// So there is one implementation of each of four things: mint a token, hash it, open a session, revoke
// a session. A caller that needs to end a session calls `revoke` here; nothing re-derives the hash.
//
// The raw token is returned to the caller exactly once and is never stored: only its hash is, so a
// database disclosure does not hand out live sessions.

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { normalizeIranPhone } from "@kmodern/contracts";
import type { createPrismaClient } from "../prisma/index.js";

type Db = ReturnType<typeof createPrismaClient>;

/** The cookie each realm's token travels in. Distinct names, so one does not overwrite the other. */
export const CUSTOMER_COOKIE = "kmodern_customer";
export const ADMIN_COOKIE = "kmodern_admin";

export const CUSTOMER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type Realm = "customer" | "admin";

/** A token, and the hash of it. The token is shown once; the hash is what gets stored. */
export interface IssuedToken {
  token: string;
  tokenHash: string;
}

/** How stale `lastSeenAt` must be before a request rewrites it. */
const LAST_SEEN_THROTTLE_MS = 60_000;

/**
 * A token and its hash.
 *
 * 32 random bytes, hex-encoded. The hash is SHA-256 rather than a slow KDF on purpose: the input is
 * 256 bits of entropy, so there is no dictionary to search, and a session lookup happens on every
 * request — a deliberately expensive hash would be paid on the hot path for no additional safety.
 */
export function mintToken(): IssuedToken {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashToken(token) };
}

/** The one hash function. Anything that needs to compare a token to a row goes through this. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A six-digit code, zero-padded so it is always six characters to read back. */
export function generateOtp(): string {
  return String(randomBytes(3).readUIntBE(0, 3) % 1_000_000).padStart(6, "0");
}

export function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function sessionTtlMs(realm: Realm): number {
  return realm === "admin" ? ADMIN_SESSION_TTL_MS : CUSTOMER_SESSION_TTL_MS;
}

export type SessionRow = { id: string; customerId: string } | { id: string; adminUserId: string };

/**
 * Open a session and hand back the token to put in a cookie.
 *
 * The caller sets the cookie. The gateway does not, because a cookie is an HTTP response detail and
 * this is where the rule lives; what it does own is the token's lifetime and its storage.
 */
export async function openCustomerSession(
  db: Db,
  customerId: string,
  meta: { ip?: string | null; userAgent?: string | null; now?: Date } = {},
): Promise<IssuedToken> {
  const now = meta.now ?? new Date();
  const { token, tokenHash } = mintToken();
  await db.customerSession.create({
    data: {
      customerId,
      tokenHash,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      expiresAt: new Date(now.getTime() + CUSTOMER_SESSION_TTL_MS),
    },
  });
  return { token, tokenHash };
}

export async function openAdminSession(
  db: Db,
  adminUserId: string,
  meta: { ip?: string | null; userAgent?: string | null; now?: Date } = {},
): Promise<IssuedToken> {
  const now = meta.now ?? new Date();
  const { token, tokenHash } = mintToken();
  await db.adminSession.create({
    data: {
      adminUserId,
      tokenHash,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      expiresAt: new Date(now.getTime() + ADMIN_SESSION_TTL_MS),
    },
  });
  return { token, tokenHash };
}

/**
 * Revoke a customer session.
 *
 * The only way a customer session ends. Idempotent — signing out twice is not an error — and it
 * revokes by hash, so the caller passes the token it holds rather than a row id it might have guessed.
 */
export async function revokeCustomerSession(db: Db, token: string, now: Date = new Date()): Promise<boolean> {
  const { count } = await db.customerSession.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: now },
  });
  return count > 0;
}

export async function revokeAdminSession(db: Db, token: string, now: Date = new Date()): Promise<boolean> {
  const { count } = await db.adminSession.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: now },
  });
  return count > 0;
}

/**
 * The customer a token belongs to, or null.
 *
 * A revoked or expired session is null rather than an error, and `lastSeenAt` is touched only when the
 * session is genuinely live — otherwise a flood of stale cookies would write to the row on every
 * request and keep a dead session's data warm.
 */
export async function customerForToken(db: Db, token: string, now: Date = new Date()) {
  const session = await db.customerSession.findFirst({
    where: { tokenHash: hashToken(token), revokedAt: null, expiresAt: { gte: now } },
    include: { customer: true },
  });
  if (!session) return null;
  await db.customerSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  return { session, customer: session.customer };
}

/**
 * The admin a token belongs to, or null.
 *
 * Same contract as `customerForToken`, and the same reason for touching `lastSeenAt` only when it has
 * gone stale: a panel page render calls this, and a render per request would write the session row on
 * every one. The minute is the panel's threshold, kept here now that this is the only implementation.
 *
 * An inactive admin is null. A session that outlived its account's deactivation is not a session.
 */
export async function adminForToken(db: Db, token: string, now: Date = new Date()) {
  const session = await db.adminSession.findFirst({
    where: { tokenHash: hashToken(token), revokedAt: null, expiresAt: { gte: now } },
    include: { adminUser: true },
  });
  if (!session || !session.adminUser.isActive) return null;
  if (now.getTime() - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await db.adminSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  }
  return { session, admin: session.adminUser };
}

/* ---------- passwords, for the optional second factor ---------- */

const MIN_PASSWORD = 8;
const SCRYPT_PREFIX = "scrypt";

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `گذرواژه باید حداقل ${MIN_PASSWORD} نویسه باشد`;
  return null;
}

/** A scrypt hash with a per-password salt. The salt is stored beside it, which is why the format is a string. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${SCRYPT_PREFIX}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== SCRYPT_PREFIX) return false;
  const [, salt, expectedHex] = parts;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(password, salt, 64);
  // Compared in constant time, and only when the lengths match — a length check that returns early
  // leaks how much of a guess was right, which is enough to make a brute force cheaper.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Bring a phone to the stored spelling, or refuse.
 *
 * Every write path that stores a phone goes through here, which is the only reason two spellings of one
 * number cannot become two customers.
 */
export function canonicalPhone(input: string): string {
  const normalized = normalizeIranPhone(input);
  if (normalized === null) throw new Error(`INVALID_PHONE:${input}`);
  return normalized;
}

/** One cookie out of a `Cookie:` header, by name. */
export function tokenFromCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

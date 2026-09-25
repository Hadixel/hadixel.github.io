import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "@kmodern/db";

// 010 admin auth: scrypt password hashes + Postgres sessions + httpOnly,
// Secure, SameSite=lax cookie host-scoped to admin.kmodern.ir (no `domain`,
// so the browser sends it only to that host — a storefront XSS can't reach it).
// Rate limit 5 fails / 15min / email; time-boxed lockout after 10 consecutive
// failures.

export const ADMIN_COOKIE = "kmodern_admin";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_FAILS_WINDOW = 5; // per 15 minutes
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_AFTER = 10; // consecutive failures
const LOCKOUT_MS = 30 * 60 * 1000;
const MAX_CONCURRENT_KDF = 4;
let activeKdf = 0;
const kdfWaiters: Array<() => void> = [];

async function withKdfBudget<T>(work: () => Promise<T>): Promise<T> {
  if (activeKdf >= MAX_CONCURRENT_KDF) {
    await new Promise<void>((resolve) => kdfWaiters.push(resolve));
  }
  activeKdf += 1;
  try {
    return await work();
  } finally {
    activeKdf -= 1;
    kdfWaiters.shift()?.();
  }
}

export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function setAdminSessionCookie(token: string, maxAge = SESSION_TTL_MS / 1000): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expectedHex] = parts;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(pw, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** number of failed login attempts for this admin within the last 15 minutes */
export async function countRecentFailures(adminUserId: string): Promise<number> {
  const since = new Date(Date.now() - FAIL_WINDOW_MS);
  return db().adminAuditLog.count({
    where: { action: "LOGIN_FAILED", adminUserId, at: { gte: since } },
  });
}

/**
 * Authenticate an admin. Returns {ok, mustChangePassword?} or {ok:false,error}.
 * Audit entries (LOGIN_FAILED / LOGIN_SUCCESS) go to AdminAuditLog (010).
 */
export async function login(email: string, password: string, ip?: string, userAgent?: string) {
  email = email.trim().toLowerCase();
  const admin = await db().adminUser.findUnique({ where: { email } });
  if (!admin || !admin.isActive) {
    // Do not reveal account existence; still record a failure shape.
    return { ok: false as const, error: "ایمیل یا گذرواژه اشتباه است" };
  }

  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    return { ok: false as const, error: "حساب به‌طور موقت قفل شده است؛ بعداً دوباره تلاش کنید" };
  }

  const recentFails = await countRecentFailures(admin.id);
  if (recentFails >= MAX_FAILS_WINDOW) {
    return { ok: false as const, error: "تلاش‌های ناموفق زیاد؛ کمی بعد دوباره تلاش کنید" };
  }

  const valid = await withKdfBudget(async () => verifyPassword(password, admin.passwordHash));
  if (!valid) {
    const updatedAdmin = await db().adminUser.update({
      where: { id: admin.id },
      data: { failedAttempts: { increment: 1 } },
    });
    const locked = updatedAdmin.failedAttempts >= LOCKOUT_AFTER;
    if (locked) {
      await db().adminUser.update({
        where: { id: admin.id },
        data: { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MS) },
      });
    }
    await db().adminAuditLog.create({
      data: {
        adminUserId: admin.id,
        action: "LOGIN_FAILED",
        entityType: "ADMIN",
        entityId: admin.id,
        ip,
        userAgent,
        meta: { email },
      },
    });
    const error =
      locked ? "تعداد تلاش‌های ناموفق از حد مجاز گذشت؛ حساب ۳۰ دقیقه قفل شد" : "ایمیل یا گذرواژه اشتباه است";
    return { ok: false as const, error };
  }

  // success
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db().adminSession.create({
    data: { adminUserId: admin.id, tokenHash: hashToken(token), ip, userAgent, expiresAt },
  });
  await db().adminUser.update({
    where: { id: admin.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await db().adminAuditLog.create({
    data: { adminUserId: admin.id, action: "LOGIN_SUCCESS", entityType: "ADMIN_USER", entityId: admin.id, ip, userAgent },
  });

  await setAdminSessionCookie(token);
  return { ok: true as const, mustChangePassword: admin.mustChangePassword };
}

/** resolve the current admin session, or null. */
export async function getAdminUser() {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const session = await db().adminSession.findFirst({
    where: { tokenHash: hashToken(token), revokedAt: null, expiresAt: { gte: new Date() } },
    include: { adminUser: true },
  });
  if (!session || !session.adminUser.isActive) return null;
  // throttle lastSeenAt writes: only update if stale by a minute
  const stale = Date.now() - session.lastSeenAt.getTime() > 60_000;
  if (stale) {
    await db().adminSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  return { session, admin: session.adminUser };
}

/** server helper: current admin or redirect to /login */
export async function requireAdmin(options: { allowPasswordChange?: boolean } = {}) {
  const ctx = await getAdminUser();
  if (!ctx) redirect("/login");
  if (ctx.admin.mustChangePassword && !options.allowPasswordChange) redirect("/change-password");
  return ctx;
}

/**
 * API authorization boundary. Route handlers must use this instead of
 * treating any valid session as a mutation-capable session: bootstrap users
 * with a forced password change are allowed to read neither admin data nor
 * operational endpoints.
 */
export async function requireAdminApi() {
  const ctx = await getAdminUser();
  if (!ctx) return { ok: false as const, status: 401 as const };
  if (ctx.admin.mustChangePassword) return { ok: false as const, status: 403 as const };
  return { ok: true as const, ctx };
}

/** revoke a session (logout / account session management) */
export async function revokeSession(sessionId: string) {
  await db().adminSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
}

export async function logout() {
  const ctx = await getAdminUser();
  const store = await cookies();
  if (ctx) {
    await db().adminSession.update({
      where: { id: ctx.session.id },
      data: { revokedAt: new Date() },
    });
  }
  store.set(ADMIN_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}
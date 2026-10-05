// Signing in and signing out, for customers and for operators.
//
// One service over one session implementation. The split that used to exist — a customer auth module
// in the storefront and an admin one in the panel, each with its own token, hash, cookie and revocation
// — meant a sign-out bug had to be found twice, and the customer one had in fact been worked around
// with a second copy of the revocation in a route handler.

import { Inject, Injectable } from "@nestjs/common";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { Prisma, createPrismaClient } from "../prisma/index.js";
import { OtpService, type OtpPurpose } from "./otp.service.js";
import {
  adminForToken,
  canonicalPhone,
  customerForToken,
  hashPassword,
  mintToken,
  openAdminSession,
  openCustomerSession,
  passwordProblem,
  revokeAdminSession,
  revokeCustomerSession,
  verifyPassword,
  ADMIN_SESSION_TTL_MS,
  type IssuedToken,
} from "./session.js";

type Db = ReturnType<typeof createPrismaClient>;

export type RequestMeta = { ip?: string | null; userAgent?: string | null };

/** A sign-in that produced a session. The token is returned once and never again. */
export type SignIn = IssuedToken & {
  customerId: string;
  /** How long the cookie should live, so the caller does not re-derive the constant. */
  ttlMs: number;
};

export type SignInFailure =
  | { ok: false; reason: "invalid-phone" | "no-code" | "too-many-attempts" | "wrong-code" | "bad-credentials" | "too-weak" | "no-password" }
  | { ok: true; signIn: SignIn };

/** The operator-facing sign-in reasons. The controller chooses the panel's message per reason. */
export type AdminSignIn =
  | { ok: false; reason: "bad-credentials" | "locked-out" | "too-many-attempts" }
  | { ok: true; signIn: SignIn; adminId: string; mustChangePassword: boolean };

export type AdminPasswordChange =
  | { ok: false; reason: "unauthenticated" | "wrong-current" | "reused" | "too-weak" }
  | { ok: true; token: string; ttlMs: number };

/** Failed attempts counted from the audit trail inside this window, per account. */
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_WINDOW = 5;
const LOCKOUT_AFTER = 10;
const LOCKOUT_MS = 30 * 60 * 1000;

/** An operator password is longer than a shopper's, because an operator can read every order. */
const ADMIN_MIN_PASSWORD = 12;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATA_CLIENT) private readonly db: Db,
    private readonly otp: OtpService,
  ) {}

  async requestOtp(phone: string, purpose: OtpPurpose = "LOGIN") {
    return this.otp.request(phone, purpose);
  }

  /**
   * Sign a customer in with a code, opening their session in the same step.
   *
   * The two halves are one operation because splitting them is how a verified customer ends up without
   * a session: the code is consumed the moment it is verified, so a failure to open the session cannot
   * be retried with the same code.
   */
  async signInWithOtp(phone: string, code: string, meta: RequestMeta = {}): Promise<SignInFailure> {
    const verified = await this.otp.verify(phone, code);
    if (!verified.ok) return verified;
    const issued = await openCustomerSession(this.db, verified.customerId, meta);
    return { ok: true, signIn: { ...issued, customerId: verified.customerId, ttlMs: 30 * 24 * 60 * 60 * 1000 } };
  }

  /** Whether this customer has set a password, which is what decides which sign-in to offer. */
  async hasPassword(phoneInput: string): Promise<boolean> {
    let phone: string;
    try {
      phone = canonicalPhone(phoneInput);
    } catch {
      return false;
    }
    const customer = await this.db.customer.findUnique({
      where: { phone },
      select: { passwordHash: true },
    });
    return Boolean(customer?.passwordHash);
  }

  /**
   * Sign in with a phone and a password.
   *
   * One error for "no such customer" and "wrong password", so the endpoint is not a way to find out
   * which phone numbers have accounts.
   */
  async signInWithPassword(
    phoneInput: string,
    password: string,
    meta: RequestMeta = {},
  ): Promise<SignInFailure> {
    let phone: string;
    try {
      phone = canonicalPhone(phoneInput);
    } catch {
      return { ok: false, reason: "bad-credentials" };
    }
    const customer = await this.db.customer.findUnique({ where: { phone } });
    const ok = customer?.passwordHash ? verifyPassword(password, customer.passwordHash) : false;
    if (!ok || !customer) return { ok: false, reason: "bad-credentials" };
    const issued = await openCustomerSession(this.db, customer.id, meta);
    return { ok: true, signIn: { ...issued, customerId: customer.id, ttlMs: 30 * 24 * 60 * 60 * 1000 } };
  }

  /**
   * Set or change a password, which needs a signed-in customer.
   *
   * The identity comes from the session token, never from the phone in the request: a password change
   * addressed to a phone number is a password change anyone can perform.
   */
  async setPassword(token: string, password: string): Promise<{ ok: true } | { ok: false; reason: "unauthenticated" | "too-weak" }> {
    const problem = passwordProblem(password);
    if (problem) return { ok: false, reason: "too-weak" };
    const found = await customerForToken(this.db, token);
    if (!found) return { ok: false, reason: "unauthenticated" };
    await this.db.customer.update({
      where: { id: found.customer.id },
      data: { passwordHash: hashPassword(password) },
    });
    return { ok: true };
  }

  /** Sign a customer out. Idempotent, and the one place a customer session is revoked. */
  async signOutCustomer(token: string): Promise<boolean> {
    return revokeCustomerSession(this.db, token);
  }

  async signOutAdmin(token: string): Promise<boolean> {
    return revokeAdminSession(this.db, token);
  }

  /**
   * Sign an operator in, against the same session contract the customers use.
   *
   * The seeded operator account goes through here too, so there is one place that decides what a valid
   * operator credential is. A separate implementation meant the panel's rules — lockouts, password
   * hashing — were the panel's own, and the gateway could not enforce them.
   *
   * The lockout and the failure window came across with the responsibility. They used to live only in
   * the panel, which meant this route was a *second* way in that had neither: the sign-in the panel
   * used was throttled, and the sign-in anyone could call directly was not. Two rules existed and only
   * one of them was attached to the door.
   *
   * Every failure is audited, including for an account that does not exist — an audit trail that only
   * records failures against real accounts is a list of who tried to get in, not of what was tried.
   */
  async signInAdmin(email: string, password: string, meta: RequestMeta = {}): Promise<AdminSignIn> {
    const now = new Date();
    const normalised = email.trim().toLowerCase();
    const admin = await this.db.adminUser.findFirst({ where: { email: normalised } });

    if (!admin || !admin.isActive) {
      await this.auditAdmin(null, "LOGIN_FAILED", "ADMIN", null, meta, { email: normalised });
      return { ok: false, reason: "bad-credentials" };
    }

    if (admin.lockedUntil && admin.lockedUntil > now) {
      return { ok: false, reason: "locked-out" };
    }

    const sinceFail = new Date(now.getTime() - FAIL_WINDOW_MS);
    const recentFails = await this.db.adminAuditLog.count({
      where: { action: "LOGIN_FAILED", adminUserId: admin.id, at: { gte: sinceFail } },
    });
    if (recentFails >= MAX_FAILS_WINDOW) return { ok: false, reason: "too-many-attempts" };

    if (!verifyPassword(password, admin.passwordHash)) {
      const after = await this.db.adminUser.update({
        where: { id: admin.id },
        data: { failedAttempts: { increment: 1 } },
        select: { failedAttempts: true },
      });
      const locked = after.failedAttempts >= LOCKOUT_AFTER;
      if (locked) {
        await this.db.adminUser.update({
          where: { id: admin.id },
          data: { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MS) },
        });
      }
      await this.auditAdmin(admin.id, "LOGIN_FAILED", "ADMIN", admin.id, meta, { email: normalised });
      return { ok: false, reason: locked ? "locked-out" : "bad-credentials" };
    }

    const issued = await openAdminSession(this.db, admin.id, meta);
    await this.db.adminUser.update({
      where: { id: admin.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: now },
    });
    await this.auditAdmin(admin.id, "LOGIN_SUCCESS", "ADMIN_USER", admin.id, meta);
    return {
      ok: true,
      signIn: { ...issued, customerId: admin.id, ttlMs: ADMIN_SESSION_TTL_MS },
      adminId: admin.id,
      mustChangePassword: admin.mustChangePassword,
    };
  }

  private auditAdmin(
    adminUserId: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    meta: RequestMeta,
    extra?: Prisma.InputJsonValue,
  ) {
    return this.db.adminAuditLog.create({
      data: {
        adminUserId,
        action,
        entityType,
        entityId,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        ...(extra ? { meta: extra } : {}),
      },
    });
  }

  /**
   * Change an operator's password and rotate their session, in one commit.
   *
   * Rotating the token that made the request is the part that matters. A password change is what a
   * person does *because* they think a copy of the session might be in someone else's hands; leaving
   * the session that was used to make the change valid would defeat that. Every other session for the
   * account is revoked, and the one making the request is reissued, so a cloned cookie stops working
   * the moment the password changes — including if it is the cookie doing the changing.
   */
  async changeAdminPassword(
    token: string,
    current: string,
    next: string,
    meta: RequestMeta = {},
  ): Promise<AdminPasswordChange> {
    const found = await adminForToken(this.db, token);
    if (!found) return { ok: false, reason: "unauthenticated" };
    if (!verifyPassword(current, found.admin.passwordHash)) return { ok: false, reason: "wrong-current" };
    if (next === current) return { ok: false, reason: "reused" };
    // The customer's 8 is not the operator's 8. An operator can read every order and every shopper's
    // phone number, so the panel has always asked for 12 from this form; keeping the two minimums
    // distinct is the point of having this check at all.
    if (next.length < ADMIN_MIN_PASSWORD) return { ok: false, reason: "too-weak" };

    const now = new Date();
    const { token: nextToken, tokenHash: nextTokenHash } = mintToken();
    await this.db.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { id: found.admin.id },
        data: { passwordHash: hashPassword(next), mustChangePassword: false },
      });
      await tx.adminSession.updateMany({
        where: { adminUserId: found.admin.id, id: { not: found.session.id }, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.adminSession.update({
        where: { id: found.session.id },
        data: { tokenHash: nextTokenHash, lastSeenAt: now },
      });
      await tx.adminAuditLog.create({
        data: {
          adminUserId: found.admin.id,
          action: "ADMIN_PASSWORD_CHANGED",
          entityType: "ADMIN_USER",
          entityId: found.admin.id,
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
      });
    });
    return { ok: true, token: nextToken, ttlMs: ADMIN_SESSION_TTL_MS };
  }

  /**
   * Revoke one of an operator's sessions, by row id.
   *
   * Scoped to the caller's own account: an operator revoking a session is revoking their own, and the
   * id comes from a form, so it is a value the caller supplies rather than one this process chose.
   */
  async revokeOwnAdminSession(
    token: string,
    sessionId: string,
    meta: RequestMeta = {},
  ): Promise<{ ok: true } | { ok: false; reason: "unauthenticated" | "not-found" }> {
    const found = await adminForToken(this.db, token);
    if (!found) return { ok: false, reason: "unauthenticated" };
    const target = await this.db.adminSession.findFirst({
      where: { id: sessionId, adminUserId: found.admin.id },
      select: { id: true },
    });
    if (!target) return { ok: false, reason: "not-found" };
    await this.db.adminSession.update({ where: { id: target.id }, data: { revokedAt: new Date() } });
    await this.auditAdmin(
      found.admin.id,
      "ADMIN_SESSION_REVOKED",
      "ADMIN_SESSION",
      target.id,
      meta,
    );
    return { ok: true };
  }

  /** The customer a token belongs to, for the routes that are scoped to one. */
  customerForToken(token: string) {
    return customerForToken(this.db, token);
  }

  adminForToken(token: string) {
    return adminForToken(this.db, token);
  }
}

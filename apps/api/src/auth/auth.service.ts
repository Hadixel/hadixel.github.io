// Signing in and signing out, for customers and for operators.
//
// One service over one session implementation. The split that used to exist — a customer auth module
// in the storefront and an admin one in the panel, each with its own token, hash, cookie and revocation
// — meant a sign-out bug had to be found twice, and the customer one had in fact been worked around
// with a second copy of the revocation in a route handler.

import { Inject, Injectable } from "@nestjs/common";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { createPrismaClient } from "../prisma/client.js";
import { OtpService, type OtpPurpose } from "./otp.service.js";
import {
  adminForToken,
  canonicalPhone,
  customerForToken,
  hashPassword,
  openAdminSession,
  openCustomerSession,
  passwordProblem,
  revokeAdminSession,
  revokeCustomerSession,
  verifyPassword,
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
   */
  async signInAdmin(email: string, password: string, meta: RequestMeta = {}): Promise<SignInFailure & { adminId?: string }> {
    const admin = await this.db.adminUser.findFirst({
      where: { email: email.trim().toLowerCase() },
    });
    const ok = admin?.passwordHash ? verifyPassword(password, admin.passwordHash) : false;
    if (!ok || !admin) return { ok: false, reason: "bad-credentials" };
    const issued = await openAdminSession(this.db, admin.id, meta);
    return { ok: true, signIn: { ...issued, customerId: admin.id, ttlMs: 7 * 24 * 60 * 60 * 1000 }, adminId: admin.id };
  }

  /** The customer a token belongs to, for the routes that are scoped to one. */
  customerForToken(token: string) {
    return customerForToken(this.db, token);
  }

  adminForToken(token: string) {
    return adminForToken(this.db, token);
  }
}

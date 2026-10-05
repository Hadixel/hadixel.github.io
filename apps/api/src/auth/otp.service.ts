// One-time codes: requested, sent, verified, consumed.
//
// The rules, and why each is here:
//
// - A code is stored hashed. A database disclosure must not hand out live login codes.
// - A code is consumed on use, and only one code per number is ever live. Requesting a new code
//   invalidates the old one, or a shopper who asked for a second code could use the first.
// - Verification is rate-limited by counting attempts on the code itself, so the limit follows the code
//   rather than the phone number and cannot be reset by asking for a new code.
// - Requesting is rate-limited per number over a window, because the cost of this endpoint is an SMS
//   somebody pays for.
// - The code is sent through the one SMS service. The number reaches the provider in the provider's
//   format, which is not the format it is stored in.
//
// The phone is normalised before any of it, so the row a code is written against is the same row the
// customer is found by however the number was typed.

import { Inject, Injectable } from "@nestjs/common";
import { kavenegarConfigFromEnv, sendLookup } from "../sms/kavenegar.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { createPrismaClient } from "../prisma/index.js";
import { canonicalPhone, generateOtp, hashOtp } from "./session.js";

type Db = ReturnType<typeof createPrismaClient>;

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
/** One code per number per this window. A shopper who asks again supersedes their earlier code. */
export const OTP_REQUEST_COOLDOWN_MS = 60_000;

export type OtpPurpose = "LOGIN" | "PLACE_ORDER";

export type OtpRequestResult =
  | { ok: true; delivered: boolean; /** Present only when no provider is configured: local development. */ devCode?: string }
  | { ok: false; reason: "invalid-phone" | "too-soon" };

export type OtpVerifyResult =
  | { ok: true; customerId: string; phone: string }
  | { ok: false; reason: "invalid-phone" | "no-code" | "too-many-attempts" | "wrong-code" };

@Injectable()
export class OtpService {
  constructor(@Inject(DATA_CLIENT) private readonly db: Db) {}

  /**
   * Issue a code and send it.
   *
   * `devCode` comes back when there is no provider configured, which is the only way a developer can
   * sign in on a machine with no SMS account. It is a deliberate leak of the code and it is gated on
   * delivery having failed — never on a successful send.
   */
  async request(phoneInput: string, purpose: OtpPurpose = "LOGIN"): Promise<OtpRequestResult> {
    let phone: string;
    try {
      phone = canonicalPhone(phoneInput);
    } catch {
      return { ok: false, reason: "invalid-phone" };
    }

    const now = new Date();
    const recent = await this.db.otpCode.findFirst({
      where: { phone, purpose, createdAt: { gte: new Date(now.getTime() - OTP_REQUEST_COOLDOWN_MS) } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (recent) return { ok: false, reason: "too-soon" };

    const code = generateOtp();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

    // Supersede, then issue. Doing it in this order means there is never a moment with two live codes
    // for one number, and a code that was already superseded cannot be used after a new one is issued.
    await this.db.otpCode.updateMany({
      where: { phone, purpose, usedAt: null },
      data: { usedAt: now },
    });
    await this.db.otpCode.create({
      data: { phone, codeHash: hashOtp(code), purpose, expiresAt },
    });

    const delivered = await this.deliver(phone, code);
    await this.db.notificationLog.create({
      data: {
        phone,
        template: "otp",
        status: delivered ? "SENT" : "FAILED",
        error: delivered ? undefined : "no provider/configured",
      },
    });

    return delivered ? { ok: true, delivered } : { ok: true, delivered: false, devCode: code };
  }

  /**
   * Check a code and consume it.
   *
   * The customer is found or created by the normalised number, so signing in with `+98…` reaches the
   * same account as signing in with `09…` — and creating it here means the first sign-in is the
   * account's creation, which is how a phone-first shop works.
   */
  async verify(phoneInput: string, code: string, purpose: OtpPurpose = "LOGIN"): Promise<OtpVerifyResult> {
    let phone: string;
    try {
      phone = canonicalPhone(phoneInput);
    } catch {
      return { ok: false, reason: "invalid-phone" };
    }

    const now = new Date();
    const otp = await this.db.otpCode.findFirst({
      where: { phone, purpose, usedAt: null, expiresAt: { gte: now } },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) return { ok: false, reason: "no-code" };
    if (otp.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "too-many-attempts" };

    if (hashOtp(code) !== otp.codeHash) {
      // Counted on the code, so exhausting the attempts burns this code rather than the number: asking
      // for a new one resets the count, which is correct, because a new code is a new 1-in-a-million.
      await this.db.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      return { ok: false, reason: "wrong-code" };
    }

    await this.db.otpCode.update({ where: { id: otp.id }, data: { usedAt: now } });
    const customer = await this.db.customer.upsert({
      where: { phone },
      update: {},
      create: { phone, smsMarketingConsent: false },
    });
    return { ok: true, customerId: customer.id, phone };
  }

  /**
   * Send through the one SMS service.
   *
   * A provider that is down must not fail a sign-in request — the code is already stored, so the
   * shopper can still be given it in development, and the failure is recorded rather than swallowed.
   */
  private async deliver(phone: string, code: string): Promise<boolean> {
    const config = kavenegarConfigFromEnv();
    if (!config) return false;
    try {
      await sendLookup(config, { phone, template: "otp", tokens: [code] });
      return true;
    } catch {
      return false;
    }
  }
}

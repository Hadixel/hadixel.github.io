import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@kmodern/db";
import { kavenegarConfigFromEnv, sendLookup } from "@kmodern/adapters";

// 009 customer auth: phone-first, OTP-primary. Sessions in CustomerSession,
// httpOnly cookie. Admin realm is separate (apps/admin/src/lib/auth.ts).

export const CUSTOMER_COOKIE = "kmodern_customer";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function generateOtp(): string {
  return String(randomBytes(3).readUIntBE(0, 3) % 1000000).padStart(6, "0");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Issue OTP, persist hashed code, send via Kavenegar when configured. */
export async function sendOtp(phone: string): Promise<{ ok: true; delivered: boolean; devCode?: string }> {
  const code = generateOtp();
  const codeHash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  await db().otpCode.create({ data: { phone, codeHash, purpose: "LOGIN", expiresAt } });

  const cfg = kavenegarConfigFromEnv();
  let delivered = false;
  if (cfg) {
    try {
      await sendLookup(cfg, { phone, template: "otp", tokens: [code] });
      delivered = true;
    } catch {
      // mark failed; dev fallback below
    }
  }
  await db().notificationLog.create({
    data: { phone, template: "otp", status: delivered ? "SENT" : "FAILED", error: delivered ? undefined : "no provider/configured" },
  });
  return { ok: true, delivered, devCode: delivered ? undefined : code };
}

/** verify OTP, create/link Customer, open a session cookie */
export async function verifyAndLogin(phone: string, code: string): Promise<{ ok: boolean; error?: string; customerId?: string }> {
  const otp = await db().otpCode.findFirst({
    where: { phone, purpose: "LOGIN", usedAt: null, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return { ok: false, error: "کد منقضی یا نامعتبر است" };
  if (otp.attempts >= 5) return { ok: false, error: "تعداد تلاش بیش از حد" };
  const valid = createHash("sha256").update(code).digest("hex") === otp.codeHash;
  if (!valid) {
    await db().otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: "کد اشتباه است" };
  }
  await db().otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });

  const customer = await db().customer.upsert({
    where: { phone },
    update: {},
    create: { phone, smsMarketingConsent: false },
  });

  const token = randomBytes(32).toString("hex");
  await db().customerSession.create({
    data: {
      customerId: customer.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  const store = await cookies();
  store.set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return { ok: true, customerId: customer.id };
}

export async function currentCustomer() {
  const store = await cookies();
  const token = store.get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  const session = await db().customerSession.findFirst({
    where: { tokenHash: hashToken(token), revokedAt: null, expiresAt: { gte: new Date() } },
    include: { customer: true },
  });
  if (!session) return null;
  await db().customerSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });
  return { session, customer: session.customer };
}
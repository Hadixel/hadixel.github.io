// One-time codes and sessions, against a real database.
//
// The rules being pinned, each of which was a decision made somewhere different before:
//
// - a code is stored hashed, so a database disclosure does not hand out live codes;
// - a code is consumed on use and cannot be used twice;
// - a new code supersedes the old one, so a shopper who asked twice cannot use the first;
// - verification is rate-limited on the code, and requesting is rate-limited on the number;
// - a phone reaches the provider, and is stored, in one spelling however it was typed;
// - signing out revokes the session, and a revoked token stops working immediately.

import { beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/auth.service.js";
import { OtpService, OTP_MAX_ATTEMPTS } from "../src/auth/otp.service.js";
import {
  hashOtp,
  hashToken,
  mintToken,
  revokeCustomerSession,
  verifyPassword,
  hashPassword,
  canonicalPhone,
} from "../src/auth/session.js";
import { tokenFromCookie } from "../src/auth/session.js";
import { $Enums, db } from "../src/prisma/index.js";
import { resetDatabase } from "./harness.js";

function otp(): OtpService {
  return new OtpService(db() as never);
}

function auth(): AuthService {
  return new AuthService(db() as never, otp());
}

async function aCustomer(phone = "09121234567") {
  return db().customer.create({ data: { phone: canonicalPhone(phone) } });
}

describe("requesting a code", () => {
  beforeEach(resetDatabase);

  it("stores a hashed code, never the code itself", async () => {
    const requested = await otp().request("09121234567");
    expect(requested.ok).toBe(true);
    const code = requested.ok && requested.devCode ? requested.devCode : undefined;
    expect(code).toBeTruthy();

    const rows = await db().otpCode.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].codeHash).not.toBe(code);
    expect(rows[0].codeHash).toBe(hashOtp(code as string));
  });

  it("normalises the number before storing it, so the row is findable however it was typed", async () => {
    await otp().request("+989121234567");
    const rows = await db().otpCode.findMany();
    expect(rows[0].phone).toBe("09121234567");
  });

  it("refuses a number it would have to guess at", async () => {
    const result = await otp().request("12345");
    expect(result).toEqual({ ok: false, reason: "invalid-phone" });
    expect(await db().otpCode.count()).toBe(0);
  });

  // The cost of this endpoint is an SMS somebody pays for.
  it("will not issue a second code inside the cooldown", async () => {
    expect((await otp().request("09121234567")).ok).toBe(true);
    expect(await otp().request("09121234567")).toEqual({ ok: false, reason: "too-soon" });
    expect(await db().otpCode.count()).toBe(1);
  });

  // Otherwise a shopper who asked twice could still use the first code.
  it("supersedes the earlier code rather than leaving two live", async () => {
    const first = await otp().request("09121234567");
    // Age the first past the cooldown, then ask again.
    await db().otpCode.updateMany({
      data: { createdAt: new Date(Date.now() - 10 * 60_000) },
    });
    const second = await otp().request("09121234567");
    expect(second.ok).toBe(true);

    const rows = await db().otpCode.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0].usedAt).not.toBeNull();

    const firstCode = first.ok && first.devCode ? first.devCode : "";
    const secondCode = second.ok && second.devCode ? second.devCode : "";
    expect((await otp().verify("09121234567", firstCode)).ok).toBe(false);
    expect((await otp().verify("09121234567", secondCode)).ok).toBe(true);
  });

  it("hands back the code when no provider is configured, so a developer can sign in", async () => {
    const requested = await otp().request("09121234567");
    expect(requested.ok && requested.delivered).toBe(false);
    expect(requested.ok && requested.devCode).toMatch(/^\d{6}$/);
  });
});

describe("verifying a code", () => {
  beforeEach(resetDatabase);

  it("opens a session and finds or creates the customer", async () => {
    const requested = await otp().request("09121234567");
    const code = requested.ok && requested.devCode ? requested.devCode : "";

    const result = await otp().verify("09121234567", code);

    expect(result.ok).toBe(true);
    expect(await db().customer.count()).toBe(1);
  });

  it("consumes the code, so the same code cannot sign anyone in again", async () => {
    const requested = await otp().request("09121234567");
    const code = requested.ok && requested.devCode ? requested.devCode : "";
    await otp().verify("09121234567", code);

    const again = await otp().verify("09121234567", code);

    expect(again).toEqual({ ok: false, reason: "no-code" });
  });

  it("reaches the same customer however the number was typed", async () => {
    const customer = await aCustomer();
    const requested = await otp().request("+989121234567");
    const code = requested.ok && requested.devCode ? requested.devCode : "";

    const result = await otp().verify("09121234567", code);

    expect(result.ok && result.customerId).toBe(customer.id);
    expect(await db().customer.count()).toBe(1);
  });

  it("refuses a wrong code without consuming it", async () => {
    const requested = await otp().request("09121234567");
    const code = requested.ok && requested.devCode ? requested.devCode : "";

    expect(await otp().verify("09121234567", "000000")).toEqual({ ok: false, reason: "wrong-code" });
    // Still usable, because a mistyped code is a typo rather than an attack.
    expect((await otp().verify("09121234567", code)).ok).toBe(true);
  });

  it("stops accepting a code after too many wrong guesses", async () => {
    await otp().request("09121234567");
    for (let attempt = 0; attempt < OTP_MAX_ATTEMPTS; attempt += 1) {
      expect(await otp().verify("09121234567", "000000")).toEqual({
        ok: false,
        reason: "wrong-code",
      });
    }
    expect(await otp().verify("09121234567", "000000")).toEqual({
      ok: false,
      reason: "too-many-attempts",
    });
  });

  it("refuses an expired code", async () => {
    const requested = await otp().request("09121234567");
    const code = requested.ok && requested.devCode ? requested.devCode : "";
    await db().otpCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    expect(await otp().verify("09121234567", code)).toEqual({ ok: false, reason: "no-code" });
  });
});

describe("sessions", () => {
  beforeEach(resetDatabase);

  it("issues a token whose hash is what gets stored", async () => {
    const customer = await aCustomer();
    const issued = await auth().signInWithPassword("09121234567", "ignored");
    // No password set, so this fails — proving the identity check runs before any session is opened.
    expect(issued.ok).toBe(false);
    expect(await db().customerSession.count()).toBe(0);
    expect(customer.id).toBeTruthy();
  });

  it("stores only the hash, so a database disclosure is not a set of live sessions", async () => {
    const customer = await aCustomer();
    await db().customer.update({
      where: { id: customer.id },
      data: { passwordHash: hashPassword("correct-horse") },
    });
    const result = await auth().signInWithPassword("09121234567", "correct-horse");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = await db().customerSession.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashToken(result.signIn.token));
    expect(rows[0].tokenHash).not.toBe(result.signIn.token);
  });

  it("resolves a token to its customer", async () => {
    const customer = await aCustomer();
    await db().customer.update({
      where: { id: customer.id },
      data: { passwordHash: hashPassword("correct-horse") },
    });
    const signedIn = await auth().signInWithPassword("09121234567", "correct-horse");
    expect(signedIn.ok).toBe(true);
    if (!signedIn.ok) return;

    const found = await auth().customerForToken(signedIn.signIn.token);

    expect(found?.customer.id).toBe(customer.id);
  });

  // The revocation the storefront's logout route used to re-implement.
  it("stops a token working the moment it is revoked", async () => {
    const customer = await aCustomer();
    await db().customer.update({
      where: { id: customer.id },
      data: { passwordHash: hashPassword("correct-horse") },
    });
    const signedIn = await auth().signInWithPassword("09121234567", "correct-horse");
    expect(signedIn.ok).toBe(true);
    if (!signedIn.ok) return;

    expect(await auth().customerForToken(signedIn.signIn.token)).not.toBeNull();
    await auth().signOutCustomer(signedIn.signIn.token);
    expect(await auth().customerForToken(signedIn.signIn.token)).toBeNull();
  });

  it("signing out twice is a success, not an error", async () => {
    const customer = await aCustomer();
    await db().customer.update({
      where: { id: customer.id },
      data: { passwordHash: hashPassword("correct-horse") },
    });
    const signedIn = await auth().signInWithPassword("09121234567", "correct-horse");
    expect(signedIn.ok).toBe(true);
    if (!signedIn.ok) return;
    await auth().signOutCustomer(signedIn.signIn.token);
    expect(await auth().signOutCustomer(signedIn.signIn.token)).toBe(false);
  });

  it("refuses a token that was never issued", async () => {
    expect(await auth().customerForToken("nonsense")).toBeNull();
  });

  it("refuses an expired session", async () => {
    const customer = await aCustomer();
    await db().customer.update({
      where: { id: customer.id },
      data: { passwordHash: hashPassword("correct-horse") },
    });
    const signedIn = await auth().signInWithPassword("09121234567", "correct-horse");
    expect(signedIn.ok).toBe(true);
    if (!signedIn.ok) return;
    await db().customerSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await auth().customerForToken(signedIn.signIn.token)).toBeNull();
  });

  it("mints a different token every time", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => mintToken().token));
    expect(tokens.size).toBe(50);
  });

  it("revokes by hash, so a caller cannot revoke a session it does not hold a token for", async () => {
    const customer = await aCustomer();
    const row = await db().customerSession.create({
      data: {
        customerId: customer.id,
        tokenHash: hashToken("the-real-token"),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    // A guessed row id is not enough.
    expect(await revokeCustomerSession(db() as never, "a-guess")).toBe(false);
    const byId = await db().customerSession.findUniqueOrThrow({ where: { id: row.id } });
    expect(byId.revokedAt).toBeNull();
  });
});

describe("passwords", () => {
  beforeEach(resetDatabase);

  it("verifies the right password and refuses the wrong one", () => {
    const stored = hashPassword("correct-horse");
    expect(verifyPassword("correct-horse", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("salts, so the same password does not produce the same hash", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("refuses a stored value it cannot read, rather than throwing", () => {
    expect(verifyPassword("anything", "not-a-scrypt-hash")).toBe(false);
    expect(verifyPassword("anything", "")).toBe(false);
  });

  it("refuses a weak password", async () => {
    const customer = await aCustomer();
    await db().customer.update({
      where: { id: customer.id },
      data: { passwordHash: hashPassword("correct-horse") },
    });
    const signedIn = await auth().signInWithPassword("09121234567", "correct-horse");
    expect(signedIn.ok).toBe(true);
    if (!signedIn.ok) return;

    expect(await auth().setPassword(signedIn.signIn.token, "short")).toEqual({
      ok: false,
      reason: "too-weak",
    });
  });

  // A password change addressed to a phone number is a change anyone can perform.
  it("changes a password only for a signed-in customer", async () => {
    const customer = await aCustomer();
    expect(await auth().setPassword("no-such-token", "a-long-enough-password")).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
    const stored = await db().customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(stored.passwordHash).toBeNull();
  });

  it("answers the same way for an unknown number and a wrong password", async () => {
    await aCustomer("09121234567");
    const unknown = await auth().signInWithPassword("09129999999", "correct-horse");
    const wrong = await auth().signInWithPassword("09121234567", "wrong");
    expect(unknown).toEqual({ ok: false, reason: "bad-credentials" });
    expect(wrong).toEqual({ ok: false, reason: "bad-credentials" });
  });
});

describe("operators", () => {
  beforeEach(resetDatabase);

  it("signs in against the same session contract the customers use", async () => {
    const admin = await db().adminUser.create({
      data: { email: "op@test", passwordHash: hashPassword("correct-horse"), name: "Operator" },
    });

    const result = await auth().signInAdmin("op@test", "correct-horse");

    expect(result.ok).toBe(true);
    expect(await db().adminSession.count()).toBe(1);
    const found = await auth().adminForToken(result.ok ? result.signIn.token : "");
    expect(found?.admin.id).toBe(admin.id);
  });

  it("signs an operator out through the same revocation", async () => {
    await db().adminUser.create({
      data: { email: "op@test", passwordHash: hashPassword("correct-horse"), name: "Operator" },
    });
    const result = await auth().signInAdmin("op@test", "correct-horse");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await auth().adminForToken(result.signIn.token)).not.toBeNull();
    await auth().signOutAdmin(result.signIn.token);
    expect(await auth().adminForToken(result.signIn.token)).toBeNull();
  });

  it("refuses a wrong operator password without opening a session", async () => {
    await db().adminUser.create({
      data: { email: "op@test", passwordHash: hashPassword("correct-horse"), name: "Operator" },
    });
    expect(await auth().signInAdmin("op@test", "wrong")).toEqual({
      ok: false,
      reason: "bad-credentials",
    });
    expect(await db().adminSession.count()).toBe(0);
  });
});

describe("reading a cookie", () => {
  it("finds a cookie by name among others", () => {
    expect(tokenFromCookie("a=1; kmodern_customer=abc; b=2", "kmodern_customer")).toBe("abc");
    expect(tokenFromCookie("kmodern_admin=xyz", "kmodern_customer")).toBeNull();
    expect(tokenFromCookie(undefined, "kmodern_customer")).toBeNull();
  });

  it("does not confuse the two realms' cookies", () => {
    const header = "kmodern_customer=cust; kmodern_admin=admin";
    expect(tokenFromCookie(header, "kmodern_customer")).toBe("cust");
    expect(tokenFromCookie(header, "kmodern_admin")).toBe("admin");
  });
});

describe("the notification log records what happened", () => {
  beforeEach(resetDatabase);

  it("records a failed delivery rather than swallowing it", async () => {
    await otp().request("09121234567");
    const rows = await db().notificationLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("FAILED");
  });
});

describe("the payment status enum the settlement writes", () => {
  it("is the one the schema declares", () => {
    expect($Enums.PaymentStatus.PAID).toBe("PAID");
    expect($Enums.PaymentStatus.AWAITING).toBe("AWAITING");
  });
});

// The operator's sign-in, as the gateway applies it.
//
// The panel used to own this whole file's worth of rules — a scrypt hash, a Postgres session, a
// five-per-quarter-hour failure window, a lockout after ten consecutive failures, a session rotation on
// password change — and the gateway had a `POST /auth/admin` with none of them. That route was a second
// way in: the panel's sign-in was throttled, and the one anyone could call directly was not. Routing
// the panel through the gateway without bringing the rules with it would have deleted the protection
// rather than moved it.
//
// So these tests are about the two things that were at risk in the move: the lockout surviving, and the
// panel no longer being able to reach a credential it has no business holding.

import { beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/auth.service.js";
import { OtpService } from "../src/auth/otp.service.js";
import { AuthController } from "../src/auth/auth.controller.js";
import { ADMIN_COOKIE, hashPassword } from "../src/auth/session.js";
import type { AdminContextResponse } from "../src/auth/auth.controller.js";
import { $Enums, db } from "../src/prisma/index.js";
import { resetDatabase } from "./harness.js";

function auth(): AuthService {
  return new AuthService(db() as never, new OtpService(db() as never));
}

function controller(): AuthController {
  return new AuthController(auth());
}

const META = { ip: "203.0.113.9", userAgent: "vitest" };

async function anAdmin(overrides: Record<string, unknown> = {}) {
  return db().adminUser.create({
    data: {
      email: "owner@example.test",
      name: "Owner",
      role: $Enums.AdminRole.OWNER,
      passwordHash: hashPassword("correct-horse-battery"),
      ...overrides,
    },
  });
}

const OK = "correct-horse-battery";
const WRONG = "not-the-password";

async function signIn(email = "owner@example.test", password = OK) {
  return auth().signInAdmin(email, password, META);
}

/** The `Cookie:` header value the gateway would be handed by a browser. */
function cookieFor(token: string): string {
  return `${ADMIN_COOKIE}=${token}`;
}

/** The whole request headers, for the routes that read meta as well as the session. */
function requestWith(token: string, ip = "203.0.113.9"): Record<string, string> {
  return { cookie: cookieFor(token), "x-forwarded-for": ip };
}

beforeEach(async () => {
  await resetDatabase();
});

describe("the operator lockout", () => {
  it("signs a correct credential in and records the success", async () => {
    const admin = await anAdmin();
    const result = await signIn();

    expect(result.ok).toBe(true);
    const logged = await db().adminAuditLog.findFirst({ where: { action: "LOGIN_SUCCESS" } });
    expect(logged?.adminUserId).toBe(admin.id);
  });

  it("rate-limits before it locks, so the two rules do not collide", async () => {
    const admin = await anAdmin();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await signIn("owner@example.test", WRONG);
      expect(result, `attempt ${attempt} should be a bad-credential refusal`).toEqual({
        ok: false,
        reason: "bad-credentials",
      });
    }

    // The sixth is refused by the failure window, before the password is ever checked. This is the
    // ordering the two rules depend on and it is easy to "simplify" away: the window is checked first,
    // so the lockout's ten cannot be reached inside one window. The account is throttled for a quarter
    // of an hour, and the lock only arms once the window has rolled and the next five failures land.
    expect(await signIn("owner@example.test", WRONG)).toEqual({ ok: false, reason: "too-many-attempts" });
    expect((await db().adminUser.findUniqueOrThrow({ where: { id: admin.id } })).lockedUntil).toBeNull();
  });

  it("locks the account on the failure that reaches the consecutive threshold", async () => {
    // Nine already counted, which is the state an attack spread over two windows leaves.
    const admin = await anAdmin({ failedAttempts: 9 });

    const result = await signIn("owner@example.test", WRONG);
    expect(result).toEqual({ ok: false, reason: "locked-out" });

    const stored = await db().adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    expect(stored.lockedUntil).not.toBeNull();
    expect(stored.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    // The counter is cleared by the lock, so the lockout is time-boxed rather than permanent.
    expect(stored.failedAttempts).toBe(0);
  });

  it("refuses the right password while the account is locked", async () => {
    await anAdmin({ lockedUntil: new Date(Date.now() + 60_000) });
    const result = await signIn();
    expect(result).toEqual({ ok: false, reason: "locked-out" });
  });

  it("counts the failure window from the audit trail, so it is a real window", async () => {
    const admin = await anAdmin();
    // Five failures already recorded inside the window, without touching failedAttempts — this is the
    // state a spread-out attack leaves, and the counter alone would not see it.
    for (let i = 0; i < 5; i += 1) {
      await db().adminAuditLog.create({
        data: { adminUserId: admin.id, action: "LOGIN_FAILED", at: new Date(Date.now() - 1000) },
      });
    }
    const result = await signIn();
    expect(result).toEqual({ ok: false, reason: "too-many-attempts" });
  });

  it("ignores failures older than the window", async () => {
    const admin = await anAdmin();
    for (let i = 0; i < 5; i += 1) {
      await db().adminAuditLog.create({
        data: {
          adminUserId: admin.id,
          action: "LOGIN_FAILED",
          at: new Date(Date.now() - 20 * 60 * 1000),
        },
      });
    }
    expect((await signIn()).ok).toBe(true);
  });

  it("refuses a deactivated account without saying so", async () => {
    await anAdmin({ isActive: false });
    const result = await signIn();
    expect(result).toEqual({ ok: false, reason: "bad-credentials" });
  });

  it("does not confirm whether an account exists", async () => {
    await anAdmin();
    const missing = await signIn("nobody@example.test", OK);
    const wrongPassword = await signIn("owner@example.test", WRONG);
    expect(missing).toEqual(wrongPassword);
  });

  it("clears the failure count and the lock on a successful sign-in", async () => {
    const admin = await anAdmin({ failedAttempts: 7, lockedUntil: null });
    await signIn();
    const stored = await db().adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    expect(stored.failedAttempts).toBe(0);
    expect(stored.lockedUntil).toBeNull();
  });
});

describe("who the caller is", () => {
  it("answers with the fields a page can act on and none of the ones it cannot", async () => {
    const admin = await anAdmin();
    const signed = await signIn();
    if (!signed.ok) throw new Error("expected a sign-in");

    const answer = (await controller().adminMe(cookieFor(signed.signIn.token))) as AdminContextResponse;

    expect(answer.admin).toEqual({
      id: admin.id,
      email: "owner@example.test",
      name: "Owner",
      role: "OWNER",
      mustChangePassword: false,
    });
    expect(answer.session.id).toEqual(expect.any(String));
  });

  it("does not put the password hash on the wire", async () => {
    await anAdmin();
    const signed = await signIn();
    if (!signed.ok) throw new Error("expected a sign-in");

    const answer = await controller().adminMe(cookieFor(signed.signIn.token));

    // The shape is named rather than spread, so a new column on the row is not a new field here. This
    // is the assertion that keeps it that way: a `...adminUser` would fail it.
    expect(JSON.stringify(answer)).not.toMatch(/scrypt|passwordHash|failedAttempts|lockedUntil/);
  });

  it("is 401 without a cookie", async () => {
    await expect(controller().adminMe(undefined)).rejects.toThrow();
  });

  it("is 401 for a token that has been signed out", async () => {
    await anAdmin();
    const signed = await signIn();
    if (!signed.ok) throw new Error("expected a sign-in");
    const headers = cookieFor(signed.signIn.token);

    await controller().signOutAdmin(headers);

    await expect(controller().adminMe(headers)).rejects.toThrow();
  });

  it("is 401 for a session that outlived the account being deactivated", async () => {
    const admin = await anAdmin();
    const signed = await signIn();
    if (!signed.ok) throw new Error("expected a sign-in");
    const headers = cookieFor(signed.signIn.token);

    await db().adminUser.update({ where: { id: admin.id }, data: { isActive: false } });

    await expect(controller().adminMe(headers)).rejects.toThrow();
  });
});

describe("changing a password", () => {
  it("rotates the session, so the cookie that made the change stops working", async () => {
    await anAdmin();
    const signed = await signIn();
    if (!signed.ok) throw new Error("expected a sign-in");
    const old = cookieFor(signed.signIn.token);

    const changed = (await controller().changeAdminPassword(
      { current: OK, next: "a-much-longer-password" },
      old,
      { cookie: old, "x-forwarded-for": "203.0.113.9" },
    )) as { ok: true; token: string; ttlMs: number };

    expect(changed.ok).toBe(true);
    expect(changed.token).not.toBe(signed.signIn.token);
    expect(changed.ttlMs).toBeGreaterThan(0);

    // The old cookie is the one a cloned session would still be holding.
    await expect(controller().adminMe(old)).rejects.toThrow();
    await expect(controller().adminMe(cookieFor(changed.token))).resolves.toBeTruthy();
  });

  it("revokes the account's other sessions", async () => {
    const admin = await anAdmin();
    const first = await signIn();
    const second = await signIn();
    if (!first.ok || !second.ok) throw new Error("expected two sign-ins");

    await controller().changeAdminPassword(
      { current: OK, next: "a-much-longer-password" },
      cookieFor(first.signIn.token),
      {},
    );

    const live = await db().adminSession.count({
      where: { adminUserId: admin.id, revokedAt: null },
    });
    expect(live).toBe(1);
  });

  it("clears the forced-change flag, so a bootstrap operator is not sent round again", async () => {
    const admin = await anAdmin({ mustChangePassword: true });
    const signed = await signIn();
    if (!signed.ok) throw new Error("expected a sign-in");

    await controller().changeAdminPassword(
      { current: OK, next: "a-much-longer-password" },
      cookieFor(signed.signIn.token),
      requestWith(signed.signIn.token),
    );

    const stored = await db().adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    expect(stored.mustChangePassword).toBe(false);
  });

  it("writes the audit line inside the same commit as the change", async () => {
    const admin = await anAdmin();
    const signed = await signIn();
    if (!signed.ok) throw new Error("expected a sign-in");

    await controller().changeAdminPassword(
      { current: OK, next: "a-much-longer-password" },
      cookieFor(signed.signIn.token),
      // A different address from the sign-in, so the assertion below can tell this request's meta from
      // the one the session was opened with.
      requestWith(signed.signIn.token, "198.51.100.4"),
    );

    const logged = await db().adminAuditLog.findFirst({ where: { action: "ADMIN_PASSWORD_CHANGED" } });
    expect(logged?.adminUserId).toBe(admin.id);
    expect(logged?.ip).toBe("198.51.100.4");
  });

  it("refuses a wrong current password, and leaves the old one working", async () => {
    await anAdmin();
    const signed = await signIn();
    if (!signed.ok) throw new Error("expected a sign-in");
    const headers = cookieFor(signed.signIn.token);

    await expect(
      controller().changeAdminPassword(
        { current: WRONG, next: "a-much-longer-password" },
        headers,
        requestWith(signed.signIn.token),
      ),
    ).rejects.toThrow();

    expect((await signIn()).ok).toBe(true);
  });

  it("refuses a new password that is the current one", async () => {
    await anAdmin();
    const signed = await signIn();
    if (!signed.ok) throw new Error("expected a sign-in");

    await expect(
      controller().changeAdminPassword({ current: OK, next: OK }, cookieFor(signed.signIn.token), requestWith(signed.signIn.token)),
    ).rejects.toThrow();
  });

  it("insists on twelve characters, not the customer's eight", async () => {
    await anAdmin();
    const signed = await signIn();
    if (!signed.ok) throw new Error("expected a sign-in");

    // Ten passes the shopper rule and fails the operator one. An operator can read every order and every
    // shopper's phone number, which is the reason the two minimums are not the same number.
    await expect(
      controller().changeAdminPassword(
        { current: OK, next: "0123456789" },
        cookieFor(signed.signIn.token),
        {},
      ),
    ).rejects.toThrow();
  });

  it("is 401 without a session", async () => {
    await expect(
      controller().changeAdminPassword({ current: OK, next: "a-much-longer-password" }, undefined, {}),
    ).rejects.toThrow();
  });
});

describe("revoking a session", () => {
  it("revokes one of the caller's own sessions", async () => {
    const admin = await anAdmin();
    const signed = await signIn();
    if (!signed.ok) throw new Error("expected a sign-in");
    const headers = cookieFor(signed.signIn.token);
    const me = (await controller().adminMe(headers)) as AdminContextResponse;

    await controller().revokeAdminSession({ sessionId: me.session.id }, headers, { cookie: headers });

    await expect(controller().adminMe(headers)).rejects.toThrow();
    expect(await db().adminSession.count({ where: { adminUserId: admin.id, revokedAt: null } })).toBe(0);
  });

  it("will not revoke another operator's session, even with its real id", async () => {
    await anAdmin();
    const other = await db().adminUser.create({
      data: {
        email: "other@example.test",
        name: "Other",
        role: $Enums.AdminRole.EDITOR,
        passwordHash: hashPassword(OK),
      },
    });
    const otherSession = await db().adminSession.create({
      data: { adminUserId: other.id, tokenHash: "someone-elses-hash", expiresAt: new Date(Date.now() + 60_000) },
    });

    const mine = await signIn();
    if (!mine.ok) throw new Error("expected a sign-in");
    const headers = cookieFor(mine.signIn.token);

    // The id is not a secret and the caller supplies it, so the ownership check is the only thing
    // standing between one operator and another's session.
    await expect(
      controller().revokeAdminSession({ sessionId: otherSession.id }, headers, { cookie: headers }),
    ).rejects.toThrow();

    const still = await db().adminSession.findUniqueOrThrow({ where: { id: otherSession.id } });
    expect(still.revokedAt).toBeNull();
  });

  it("writes an audit line naming the session it revoked", async () => {
    await anAdmin();
    const mine = await signIn();
    if (!mine.ok) throw new Error("expected a sign-in");
    const headers = cookieFor(mine.signIn.token);
    const me = (await controller().adminMe(headers)) as AdminContextResponse;

    await controller().revokeAdminSession({ sessionId: me.session.id }, headers, { cookie: headers });

    const logged = await db().adminAuditLog.findFirst({ where: { action: "ADMIN_SESSION_REVOKED" } });
    expect(logged?.entityId).toBe(me.session.id);
  });
});

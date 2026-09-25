"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@kmodern/db";
import { createSessionToken, hashToken, login, requireAdmin, logout as doLogout, hashPassword, setAdminSessionCookie, verifyPassword, revokeSession } from "@/lib/auth";
import { actionContext } from "./ctx";
import { recordAudit } from "@/lib/audit";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  id?: string;
}

/** POST /login form action — 010 login with rate limiting + lockout */
export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "ایمیل و گذرواژه الزامی است" };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
  const userAgent = h.get("user-agent") ?? undefined;
  const result = await login(email, password, ip, userAgent);
  if (!result.ok) return { error: result.error };
  redirect(result.mustChangePassword ? "/change-password" : "/");
}

/** change own password; atomically rotates the current session (010) */
export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, session, ip, ua } = await actionContext({ allowPasswordChange: true });
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 12) return { error: "گذرواژه جدید باید حداقل ۱۲ کاراکتر باشد" };
  if (next !== confirm) return { error: "تکرار گذرواژه یکسان نیست" };
  if (next === current) return { error: "گذرواژه جدید نباید همان قبلی باشد" };
  if (!verifyPassword(current, admin.passwordHash)) return { error: "گذرواژه فعلی اشتباه است" };

  const nextToken = createSessionToken();
  const nextTokenHash = hashToken(nextToken);
  try {
    await db().$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { id: admin.id },
        data: { passwordHash: hashPassword(next), mustChangePassword: false },
      });
      // Rotate the current token as part of the same commit. This invalidates
      // a cloned cookie even when it was the session used for the change.
      await tx.adminSession.updateMany({
        where: { adminUserId: admin.id, id: { not: session.id } },
        data: { revokedAt: new Date() },
      });
      await tx.adminSession.update({
        where: { id: session.id },
        data: { tokenHash: nextTokenHash, lastSeenAt: new Date() },
      });
      await tx.adminAuditLog.create({
        data: {
          adminUserId: admin.id,
          action: "ADMIN_PASSWORD_CHANGED",
          entityType: "ADMIN_USER",
          entityId: admin.id,
          ip,
          userAgent: ua,
        },
      });
    });
    await setAdminSessionCookie(nextToken);
  } catch {
    return { error: "تغییر گذرواژه انجام نشد؛ دوباره تلاش کنید" };
  }
  redirect("/");
}

/** revoke a specific admin session (account → sessions list) */
export async function revokeSessionAction(formData: FormData) {
  const { admin } = await requireAdmin();
  const sessionId = String(formData.get("sessionId") ?? "");
  const target = await db().adminSession.findUnique({ where: { id: sessionId } });
  if (!target || target.adminUserId !== admin.id) return { error: "نشست پیدا نشد" };
  await revokeSession(sessionId);
  await recordAudit({
    adminUserId: admin.id,
    action: "ADMIN_SESSION_REVOKED",
    entityType: "ADMIN_SESSION",
    entityId: sessionId,
  });
  return { ok: true };
}

/** POST /logout */
export async function logoutAction() {
  await doLogout();
  redirect("/login");
}

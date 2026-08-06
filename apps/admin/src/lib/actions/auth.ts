"use server";

import { redirect } from "next/navigation";
import { db } from "@kmodern/db";
import { login, requireAdmin, logout as doLogout, hashPassword, verifyPassword, revokeSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

/** POST /login form action — 010 login with rate limiting + lockout */
export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "ایمیل و گذرواژه الزامی است" };
  const result = await login(email, password);
  if (!result.ok) return { error: result.error };
  redirect(result.mustChangePassword ? "/change-password" : "/");
}

/** change own password; invalidates every other session (010) */
export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, session } = await requireAdmin();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 12) return { error: "گذرواژه جدید باید حداقل ۱۲ کاراکتر باشد" };
  if (next !== confirm) return { error: "تکرار گذرواژه یکسان نیست" };
  if (next === current) return { error: "گذرواژه جدید نباید همان قبلی باشد" };
  if (!verifyPassword(current, admin.passwordHash)) return { error: "گذرواژه فعلی اشتباه است" };

  await db().adminUser.update({
    where: { id: admin.id },
    data: { passwordHash: hashPassword(next), mustChangePassword: false },
  });
  // rotate: revoke all other sessions
  await db().adminSession.updateMany({
    where: { adminUserId: admin.id, id: { not: session.id } },
    data: { revokedAt: new Date() },
  });
  await recordAudit({
    adminUserId: admin.id,
    action: "ADMIN_PASSWORD_CHANGED",
    entityType: "ADMIN_USER",
    entityId: admin.id,
  });
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

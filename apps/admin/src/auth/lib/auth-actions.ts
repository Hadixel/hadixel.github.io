"use server";

import { redirect } from "next/navigation";
import { GatewayError, panelGateway } from "@/lib/gateway";
import { clearAdminSessionCookie, login as signIn, revokeOwnSession, setAdminSessionCookie } from "@/auth/lib/auth";
import { actionContext } from "@/lib/actions/ctx";
// The contract itself is declared beside the result shape it belongs to, not here. It used to be
// declared here, which made every form in the panel import the auth feature's server actions to type
// a `useActionState` call — one feature's module standing in for an app-wide rule. See
// `@/lib/actions/result`.
import { type ActionState } from "@/lib/actions/result";

/** POST /login form action — the gateway's lockout, failure window and audit */
export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "ایمیل و گذرواژه الزامی است" };
  try {
    const result = await signIn(email, password);
    redirect(result.mustChangePassword ? "/change-password" : "/");
  } catch (error) {
    // `redirect` signals by throwing, so a catch around the sign-in would otherwise swallow the
    // navigation and report a failed login for a successful one.
    if (isRedirect(error)) throw error;
    return { error: describe(error) };
  }
}

/**
 * Change own password.
 *
 * The gateway verifies the current password, sets the new one, revokes every other session and rotates
 * this one, in a single commit. The rotated token comes back here and has to be written to the cookie
 * before the redirect — keeping the old cookie would leave the session that performed the change valid,
 * which is the exact case the rotation exists for.
 */
export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionContext({ allowPasswordChange: true });
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 12) return { error: "گذرواژه جدید باید حداقل ۱۲ کاراکتر باشد" };
  if (next !== confirm) return { error: "تکرار گذرواژه یکسان نیست" };

  try {
    const client = await panelGateway();
    const result = await client.post<{ token: string; ttlMs: number }>("/auth/admin/password", {
      current,
      next,
    });
    await setAdminSessionCookie(result.token, result.ttlMs);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return { error: describe(error) };
  }
  redirect("/");
}

/** revoke a specific admin session (account → sessions list) */
export async function revokeSessionAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  try {
    await revokeOwnSession(sessionId);
    return { ok: true };
  } catch (error) {
    return { error: describe(error) };
  }
}

/** POST /logout */
export async function logoutAction() {
  const client = await panelGateway().catch(() => null);
  if (client) await client.post("/auth/admin/sign-out").catch(() => undefined);
  await clearAdminSessionCookie();
  redirect("/login");
}

/** Next signals a redirect by throwing a value with this digest. */
function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function describe(error: unknown): string {
  if (error instanceof GatewayError) {
    if (error.unreachable) return `درگاه در دسترس نیست؛ دوباره تلاش کنید (${error.message})`;
    return error.message;
  }
  return "خطای ناشناخته؛ دوباره تلاش کنید";
}

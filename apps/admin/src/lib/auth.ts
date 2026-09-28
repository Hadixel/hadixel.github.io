// 010 admin auth, now entirely a client of the gateway's.
//
// This file used to be a second implementation of every rule below — scrypt hashes, Postgres sessions,
// the httpOnly Secure SameSite=lax cookie, a 5-per-15-minutes failure window and a lockout after ten
// consecutive failures — and it had its own sign-in, its own revocation and its own audit. None of that
// was reachable from the gateway, so `POST /auth/admin` was a second way in that had no lockout at all:
// the panel's sign-in was throttled, and the sign-in anyone could call directly was not. Two rules
// existed and only one of them was attached to the door.
//
// What is left here is the part that genuinely cannot move: reading the operator's cookie off the
// incoming request and writing the response cookie. An operator's session must never be reachable from
// browser JavaScript, so there is no browser client in the panel and the cookie has to be set by the
// server that receives the browser's request — which is this process, not the gateway.
//
// One distinction this file has to keep, and it is the reason `getAdminUser` does not use `readThrough`:
// "not signed in" and "the gateway is down" both arrive as a failed request, and they mean opposite
// things. The first sends the operator to the login form. The second must not — sending an operator
// with a perfectly valid session to the login page because the gateway was briefly unreachable would
// make a blip look like an expiry, and the natural next thing they do is sign in again.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GatewayError, panelGateway } from "@/lib/gateway";

const ADMIN_COOKIE = "kmodern_admin";

/** What the gateway says about the caller. Never the admin row: see `GET /auth/admin/me`. */
export interface AdminContext {
  session: { id: string };
  admin: {
    id: string;
    email: string;
    name: string;
    /**
     * The role, as the union of the values the gateway can send rather than as `string`.
     *
     * Narrowing it here is the point: `role: string` would let `role === "OWNER"` compile even if the
     * gateway sent something else, and the three scraper routes and the panel layout all gate on
     * exactly that comparison. The three values are written out because importing the generated enum
     * would be the data dependency this whole change removes.
     */
    role: "OWNER" | "EDITOR" | "ORDER_MANAGER";
    mustChangePassword: boolean;
  };
}

/** Set the operator's cookie from a token the gateway issued. */
export async function setAdminSessionCookie(token: string, ttlMs: number): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ttlMs / 1000),
  });
}

/**
 * Expire the operator's cookie.
 *
 * Awaited rather than fired: a cookie store writes into the outgoing response headers, so a clear that
 * has not settled by the time the action returns never reaches the browser — which is the one outcome
 * this exists to prevent.
 */
export async function clearAdminSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Sign in, and set the cookie the gateway's token belongs in.
 *
 * The lockout, the failure window and the audit are the gateway's now. This only relays the outcome and
 * writes the cookie, which is the one part of a sign-in the gateway cannot do: the browser will answer
 * the next request, and the panel is what owns the cookie.
 */
export async function login(email: string, password: string) {
  const client = await panelGateway();
  const result = await client.post<{
    token: string;
    cookie: string;
    ttlMs: number;
    mustChangePassword: boolean;
  }>("/auth/admin", { email, password });
  await setAdminSessionCookie(result.token, result.ttlMs);
  return { ok: true as const, mustChangePassword: result.mustChangePassword };
}

/** The current operator, or null when there is no valid session. */
export async function getAdminUser(): Promise<AdminContext | null> {
  let client;
  try {
    client = await panelGateway();
  } catch (error) {
    // A build whose gateway address was never configured. Thrown, not returned as null: an operator
    // sent to /login for a missing build variable would be told their session expired, and signing in
    // again would fail in exactly the same way.
    throw new Error(
      error instanceof GatewayError ? error.message : "درگاه پیکربندی نشده است؛ دوباره تلاش کنید",
    );
  }

  try {
    return await client.get<AdminContext>("/auth/admin/me");
  } catch (error) {
    // 401 is the answer to the question, not a fault. Anything else is a fault, and a fault that
    // becomes "not signed in" is how an operator ends up signing in again during an outage.
    if (error instanceof GatewayError && error.statusCode === 401) return null;
    throw new Error(
      error instanceof GatewayError
        ? error.unreachable
          ? `درگاه در دسترس نیست؛ دوباره تلاش کنید (${error.message})`
          : error.message
        : "خطای ناشناخته؛ دوباره تلاش کنید",
    );
  }
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

/** Revoke one of the calling operator's own sessions. */
export async function revokeOwnSession(sessionId: string) {
  const client = await panelGateway();
  return client.post<{ ok: true }>("/auth/admin/sessions/revoke", { sessionId });
}

/**
 * Sign out.
 *
 * The cookie is cleared whatever the gateway says. A sign-out that failed to reach the gateway has
 * still removed the credential from the browser, which is the part the operator asked for; refusing to
 * clear it would leave a credential on a shared machine because the server was down.
 */
export async function logout(): Promise<void> {
  try {
    const client = await panelGateway();
    await client.post("/auth/admin/sign-out");
  } catch {
    // Deliberately swallowed — see above.
  }
  await clearAdminSessionCookie();
}

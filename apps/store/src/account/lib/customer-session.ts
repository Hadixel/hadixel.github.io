// The shopper's session, as the storefront sees it.
//
// What this module does NOT do is the point. It holds no signing secret, no user table, no session rule
// and no token-generation code: the gateway issues the token, decides how long it lives and decides
// what revokes it. The storefront's whole job is to put the token the gateway handed it in an httpOnly
// cookie and to send that cookie back on the next request.
//
// That is what §10's "no client holds credential material beyond what the gateway issues it" means in
// practice, and it is why signing out can now be one call: the revocation rule is in one place, and
// this module's sign-out is that call plus clearing the cookie.
//
// The cookie is httpOnly on purpose. The credential is then unreadable by the page's own JavaScript,
// which is what makes a token in local storage unnecessary — and it means the browser client has no
// token to attach, so a browser-side call relies on the cookie travelling with the request.

import { cookies } from "next/headers";
import { GatewayError } from "@kmodern/transport/client";
import { createServerApiClient, gatewayBaseUrl } from "@kmodern/transport/next";

/** The cookie the gateway's token travels in. The name is the same one the gateway reads. */
export const CUSTOMER_COOKIE = "kmodern_customer";

/** A sign-in the gateway accepted: the token to store and who it belongs to. */
export interface CustomerSession {
  token: string;
  customerId: string;
  ttlMs: number;
}

interface SignInResponse {
  token: string;
  cookie: string;
  ttlMs: number;
  subjectId: string;
}

/**
 * A client for an unauthenticated call — asking for a code, checking whether a password is set.
 *
 * Deliberately built without forwarding the caller's cookie: these routes are reachable by someone who
 * is not signed in, and forwarding a stale cookie to them would only add a way to get confused.
 */
async function anonymous() {
  return createServerApiClient({ baseUrl: gatewayBaseUrl() });
}

/** A client that carries the caller's own session, for the routes that need one. */
async function asCaller() {
  return createServerApiClient({ baseUrl: gatewayBaseUrl() });
}

/**
 * Put the gateway's token in an httpOnly cookie.
 *
 * `secure` follows the environment rather than being always-on, because a local http:// storefront would
 * otherwise refuse to keep the session and every sign-in would appear to silently fail.
 */
async function storeToken(token: string, ttlMs: number): Promise<void> {
  const jar = await cookies();
  jar.set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ttlMs / 1000),
  });
}

async function clearToken(): Promise<void> {
  const jar = await cookies();
  jar.delete(CUSTOMER_COOKIE);
}

/** Ask the gateway for a one-time code. */
export async function sendOtp(phone: string): Promise<{ devCode?: string }> {
  const client = await anonymous();
  const body = await client.post<{ delivered: boolean; devCode?: string }>("/auth/otp", { phone });
  // The code comes back only when no SMS provider is configured. It is passed through as the gateway
  // decided, not re-derived here.
  return body.devCode ? { devCode: body.devCode } : {};
}

/** Verify a code, and open the session the gateway issued. */
export async function verifyAndSignIn(phone: string, code: string): Promise<CustomerSession> {
  const client = await anonymous();
  const body = await client.post<SignInResponse>("/auth/otp/verify", { phone, code });
  await storeToken(body.token, body.ttlMs);
  return { token: body.token, customerId: body.subjectId, ttlMs: body.ttlMs };
}

/** Whether this shopper has set a password, which is what decides which sign-in to offer. */
export async function hasPassword(phone: string): Promise<boolean> {
  const client = await anonymous();
  const body = await client.post<{ hasPassword: boolean }>("/auth/password/check", { phone });
  return body.hasPassword;
}

/** Sign in with a password, and open the session the gateway issued. */
export async function signInWithPassword(phone: string, password: string): Promise<CustomerSession> {
  const client = await anonymous();
  const body = await client.post<SignInResponse>("/auth/password", { phone, password });
  await storeToken(body.token, body.ttlMs);
  return { token: body.token, customerId: body.subjectId, ttlMs: body.ttlMs };
}

/** Set or change a password, for a signed-in shopper. */
export async function setPassword(password: string): Promise<void> {
  const client = await asCaller();
  await client.post<{ ok: true }>("/auth/password/set", { password });
}

/**
 * Sign out.
 *
 * The revocation is the gateway's one call, and the cookie is cleared here. A shopper clicking "sign
 * out" twice is signed out either way: the gateway treats a second sign-out as a success, so this does
 * not have to distinguish the two.
 */
export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  if (token) {
    try {
      const client = await asCaller();
      await client.post<unknown>("/auth/sign-out");
    } catch {
      // A gateway that is down must not leave a shopper signed in on this device: the cookie is
      // cleared either way, and the session it pointed at expires on its own.
    }
  }
  await clearToken();
}

/**
 * The signed-in shopper, or null. The gateway decides; this only forwards the cookie.
 *
 * Shaped as `{ customer }` because that is what every caller has always destructured, and one of them
 * is a file being edited elsewhere in this repository. Changing the shape would mean editing that file
 * for no reason beyond tidiness.
 *
 * Only a 401 or a 404 is a signed-out shopper. Every other failure is re-thrown, because a gateway that
 * is down is not a signed-out shopper and a signed-out shopper is not an outage — collapsing the two is
 * what logs everybody out during a blip. That is the right call for a page whose subject is the shopper.
 */
export async function currentCustomer(): Promise<{ customer: { id: string; phone: string } } | null> {
  const jar = await cookies();
  if (!jar.get(CUSTOMER_COOKIE)?.value) return null;
  try {
    const client = await asCaller();
    const me = await client.get<{ customerId: string; phone: string }>("/auth/me");
    return { customer: { id: me.customerId, phone: me.phone } };
  } catch (error) {
    if (error instanceof GatewayError && (error.unauthorized || error.notFound)) return null;
    throw error;
  }
}

/**
 * The shopper for chrome that must not fail, or null.
 *
 * The header renders inside the root layout, so anything it throws is not caught by `app/error.tsx` —
 * per the Next docs that boundary does not wrap the layout above it — and takes the entire storefront
 * down to `global-error.tsx`, catalog included. A missing build-time `NEXT_PUBLIC_API_URL`, or a gateway
 * that is briefly unreachable, would then take down every page rather than the one thing that needed it.
 *
 * So a gateway failure here reports signed-out chrome and says so in the log, while `currentCustomer`
 * keeps re-throwing for the pages that would rather show a retry. The two differ on purpose: this one
 * is asked "is there an icon in the corner", and that question has a safe answer.
 */
export async function currentCustomerForChrome(): Promise<{ customer: { id: string; phone: string } } | null> {
  try {
    return await currentCustomer();
  } catch (error) {
    if (error instanceof GatewayError) {
      console.error("[store] header session read failed; rendering signed-out chrome", error);
      return null;
    }
    throw error;
  }
}

export { GatewayError };

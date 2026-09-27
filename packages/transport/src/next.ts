// The two ways a client reaches the gateway.
//
// The duplication between these two is the one §10 permits, and it lives in one file so that it reads
// as what it is rather than as a second factory: a browser caller has no credential of its own and lets
// the cookie travel with the request, while a server-side caller holds the caller's credential on the
// incoming request and forwards it. The request they build is otherwise identical.

import { cookies, headers } from "next/headers";
import { createApiClient, type ApiClient } from "./client.js";

/** Identity, per §10: one name per audience, and nothing else varies between the clients. */
export const CUSTOMER_COOKIE = "kmodern_customer";
export const ADMIN_COOKIE = "kmodern_admin";

/**
 * A client for code running in the browser.
 *
 * The credential is an httpOnly cookie, so browser JavaScript cannot read it — which is exactly why it
 * is safe, and also why this function has no token to pass. The browser sends the cookie with the
 * request on its own; there is nothing to attach.
 */
export function createBrowserApiClient(opts: {
  baseUrl: string;
  tokenName?: string;
  onError?: Parameters<typeof createApiClient>[0]["onError"];
}): ApiClient {
  return createApiClient({
    baseUrl: opts.baseUrl,
    tokenName: opts.tokenName ?? CUSTOMER_COOKIE,
    getToken: () => null,
    ...(opts.onError ? { onError: opts.onError } : {}),
  });
}

/**
 * A client for a server component or a server action, holding the caller's credential.
 *
 * This is the read helper §10 describes: credentials come from the request context rather than from
 * browser storage, so the caller's own session is what the gateway sees. Forwarding the caller's cookie
 * jar is what lets a shopper's request act as that shopper; a session that also carries something else
 * keeps working, which a rebuilt one-value cookie would silently break.
 */
export async function createServerApiClient(opts: {
  baseUrl: string;
  /** Which realm's cookie to forward. Defaults to the shopper's. */
  tokenName?: string;
  onError?: Parameters<typeof createApiClient>[0]["onError"];
}): Promise<ApiClient> {
  const jar = await cookies();
  const all = await headers();
  return createApiClient({
    baseUrl: opts.baseUrl,
    tokenName: opts.tokenName ?? CUSTOMER_COOKIE,
    getToken: () => jar.get(opts.tokenName ?? CUSTOMER_COOKIE)?.value ?? null,
    getCookieHeader: () => all.get("cookie") ?? null,
    ...(opts.onError ? { onError: opts.onError } : {}),
  });
}

/**
 * The gateway's address for a build.
 *
 * Empty when unset, deliberately: the client factory then refuses to start with a message that names
 * the variable. Defaulting to a loopback address would produce a deployed build that quietly calls
 * nothing and reports every read as a gateway failure.
 */
export function gatewayBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return env.NEXT_PUBLIC_API_URL ?? "";
}

/** The caller's whole cookie header, for a caller that needs it verbatim. */
export async function forwardedCookieHeader(): Promise<string | undefined> {
  const all = await headers();
  return all.get("cookie") ?? undefined;
}

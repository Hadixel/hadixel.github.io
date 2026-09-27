// The two ways a client reaches the gateway.
//
// The duplication between these two is the one §10 permits, and it lives in one file so that it reads
// as what it is rather than as a second factory: a browser caller has no credential of its own and lets
// the cookie travel with the request, while a server-side caller holds the caller's credential on the
// incoming request and forwards it. The request they build is otherwise identical.

import { cookies, headers } from "next/headers";
import { createApiClient, type ApiClient } from "./client";

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
 * The caller's cookie jar, or null when there is no request to read one from.
 *
 * Next's `cookies()` throws outside a request scope, and that is not an error condition worth
 * propagating: it means "there is no caller here", and the honest result of that is a request with no
 * credential. Swallowing it is what keeps this module drivable from a test — criterion 9 asks for
 * exactly that — and it is safe, because a credential-less request is answered 401 by the gateway rather
 * than being treated as an authenticated one.
 */
// Inferred from the functions, not imported by name: `next/headers` exports the two functions but
// not their return types, and reaching into `next/dist` for them would pin this file to one release.
type RequestCookies = Awaited<ReturnType<typeof cookies>>;
type RequestHeaders = Awaited<ReturnType<typeof headers>>;

async function readRequestCookies(): Promise<RequestCookies | null> {
  try {
    return await cookies();
  } catch {
    return null;
  }
}

async function readRequestHeaders(): Promise<RequestHeaders | null> {
  try {
    return await headers();
  } catch {
    return null;
  }
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
  /** An explicit credential, for a caller that has one to hand rather than one to read. */
  token?: string;
  onError?: Parameters<typeof createApiClient>[0]["onError"];
}): Promise<ApiClient> {
  const name = opts.tokenName ?? CUSTOMER_COOKIE;
  const jar = await readRequestCookies();
  const all = await readRequestHeaders();
  const explicit = opts.token;
  return createApiClient({
    baseUrl: opts.baseUrl,
    tokenName: name,
    getToken: () => explicit ?? jar?.get(name)?.value ?? null,
    getCookieHeader: () => all?.get("cookie") ?? null,
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

// Who may make a change.
//
// One implementation, called by every mutating route. It used to exist five times in the panel, one
// per route handler, and each copy asked the question slightly differently — which is the failure mode
// this file exists to remove rather than to reduce. See tests/origin.test.ts for the rule and the
// reasoning; this is the implementation of it.

import { ForbiddenException } from "./exceptions/gateway.exception.js";

/**
 * Whether a request's `Origin` is one the gateway accepts.
 *
 * Exact string comparison, deliberately. Every looser comparison that comes to mind is a way to admit
 * a host that merely starts with an allowed one, and the allowlist is short enough that there is no
 * reason to be clever about matching it.
 */
export function originAllowed(origin: string | null | undefined, allowed: readonly string[]): boolean {
  // No origin means the request did not come from a page. See the note in the test file: a browser
  // always sends one cross-site, so its absence cannot be forged by the attacker being defended
  // against, and refusing it would lock out the panel's own server-side call.
  if (origin === null || origin === undefined || origin === "") return allowed.length > 0;
  return allowed.includes(origin);
}

/**
 * Refuse a mutation whose origin is not allowed.
 *
 * Throws rather than returning a boolean, because every caller of this is a route that must not
 * continue, and a boolean is a value a caller can forget to check.
 */
export function assertAllowedOrigin(
  origin: string | null | undefined,
  allowed: readonly string[],
): void {
  if (!originAllowed(origin, allowed)) {
    throw new ForbiddenException("این عملیات از این مبدأ مجاز نیست.");
  }
}

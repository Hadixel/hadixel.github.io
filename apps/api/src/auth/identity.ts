// Who is asking, read from the request's own credentials.
//
// Every customer-scoped route in the gateway needs the same thing and got it wrong in the same way
// twice: a stub that returned null, so every route answered 401 and the features were unreachable. This
// module is the one place a token becomes an identity.
//
// A caller is identified by a cookie the gateway issued, never by an id in the path or the body. An id
// a client supplies is an id a client can change, and "read any order" is exactly the capability that
// must not be client-controlled.
//
// The lookup is deliberately not cached in a module-level variable: a request-scoped identity that
// outlives its request is a session that keeps working after it should have ended.

import type { Request } from "express";
import { UnauthorizedException } from "../common/exceptions/gateway.exception.js";
import { ADMIN_COOKIE, CUSTOMER_COOKIE } from "../auth/session.js";
import { AuthService } from "../auth/auth.service.js";
import { tokenFromCookie } from "../auth/auth.controller.js";

/** Read a named cookie out of a request. Exported because the controllers all need it. */
export function cookieToken(req: Request, name: string): string | null {
  return tokenFromCookie(req.headers.cookie, name);
}

/**
 * The customer a request is acting as.
 *
 * Throws rather than returning null, because every caller of this is a route that cannot proceed
 * without a customer, and a null check at each of them is a chance to forget it.
 */
export async function requireCustomer(auth: AuthService, req: Request): Promise<{ id: string; phone: string }> {
  const token = cookieToken(req, CUSTOMER_COOKIE);
  if (!token) throw new UnauthorizedException();
  const found = await auth.customerForToken(token);
  if (!found) throw new UnauthorizedException();
  return { id: found.customer.id, phone: found.customer.phone };
}

/** The operator a request is acting as, for the panel's routes. */
export async function requireAdmin(auth: AuthService, req: Request): Promise<{ id: string; email: string }> {
  const token = cookieToken(req, ADMIN_COOKIE);
  if (!token) throw new UnauthorizedException();
  const found = await auth.adminForToken(token);
  if (!found) throw new UnauthorizedException();
  return { id: found.admin.id, email: found.admin.email };
}

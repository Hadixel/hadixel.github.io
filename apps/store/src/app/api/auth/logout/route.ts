import { NextResponse } from "next/server";
import { signOut } from "@/lib/customer-session";

/**
 * Sign the shopper out.
 *
 * This used to hash the cookie's value and write a `revokedAt` itself, because the auth module did not
 * expose a revocation. Two copies of "end this session" is two places for a session to survive a sign
 * out, and the copy that ran was this one. The rule is now the gateway's single call, and this route
 * only clears the cookie.
 */
export async function POST() {
  await signOut();
  return NextResponse.json({ ok: true });
}

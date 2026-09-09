import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@kmodern/db";
import { CUSTOMER_COOKIE } from "@/lib/auth";

/** Revoke the current customer session and clear the cookie. */
export async function POST() {
  const store = await cookies();
  const token = store.get(CUSTOMER_COOKIE)?.value;
  if (token) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await db().customerSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  store.delete(CUSTOMER_COOKIE);
  return NextResponse.json({ ok: true });
}

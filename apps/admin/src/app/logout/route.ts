import { NextResponse } from "next/server";
import { logout } from "@/auth/lib/auth";
import { sameOrigin } from "@/lib/origin";

export const runtime = "nodejs";

/** POST /logout — revoke session + clear cookie */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  await logout();
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.set("kmodern_admin", "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  return res;
}

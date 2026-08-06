import { NextResponse } from "next/server";
import { logout } from "@/lib/auth";

export const runtime = "nodejs";

/** POST /logout — revoke session + clear cookie */
export async function POST(_req: Request) {
  await logout();
  const res = NextResponse.redirect(new URL("/login", _req.url));
  res.cookies.set("kmodern_admin", "", { path: "/", maxAge: 0 });
  return res;
}
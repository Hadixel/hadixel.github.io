import { NextResponse } from "next/server";
import { logout } from "@/lib/auth";

export const runtime = "nodejs";

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]
    .trim();
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

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

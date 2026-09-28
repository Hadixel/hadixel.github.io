"use server";

import { headers } from "next/headers";
import { requireAdmin, type AdminContext } from "@/lib/auth";

// Shared per-action context: current admin (redirects to /login if absent)
// + client IP / user agent for audit entries (010).
//
// The IP and user agent are still read here rather than asked for, because they describe *this*
// request — the one the action arrived on — and the gateway can only see the request it was sent. The
// admin and session come from the gateway, which is the only process that gets to decide what a valid
// session is.

export interface ActionCtx {
  admin: AdminContext["admin"];
  session: AdminContext["session"];
  ip?: string;
  ua?: string;
}

export async function actionContext(options: { allowPasswordChange?: boolean } = {}): Promise<ActionCtx> {
  const { admin, session } = await requireAdmin(options);
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
  const ua = h.get("user-agent") ?? undefined;
  return { admin, session, ip, ua };
}

"use server";

import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import type { AdminUser } from "@kmodern/db";

// Shared per-action context: current admin (redirects to /login if absent)
// + client IP / user agent for audit entries (010).

export interface ActionCtx {
  admin: AdminUser;
  ip?: string;
  ua?: string;
}

export async function actionContext(): Promise<ActionCtx> {
  const { admin } = await requireAdmin();
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
  const ua = h.get("user-agent") ?? undefined;
  return { admin, ip, ua };
}
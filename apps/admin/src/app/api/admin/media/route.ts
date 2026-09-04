import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth";
import { listMedia } from "@/lib/media";

export const runtime = "nodejs";

/** GET /api/admin/media — media list for the picker modal */
export async function GET() {
  const ctx = await getAdminUser();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const items = await listMedia();
  return NextResponse.json({ items });
}

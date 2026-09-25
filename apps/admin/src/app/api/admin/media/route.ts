import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { listMedia } from "@/lib/media";

export const runtime = "nodejs";

/** GET /api/admin/media — media list for the picker modal */
export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "unauthorized" : "password_change_required" },
      { status: auth.status },
    );
  }
  try {
    const items = await listMedia();
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: "media_list_failed" }, { status: 500 });
  }
}

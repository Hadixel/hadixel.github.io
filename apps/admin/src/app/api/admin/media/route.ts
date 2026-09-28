// GET /api/admin/media — the media library, for the picker.
//
// A read, and the one thing this route is still here to do: the panel's browser is what asks for it.
// The walk is the gateway's, because knowing which keys the library may hold is a rule that belongs
// with the code that enforces it — the panel carried its own copy of the key pattern, so a key the
// gateway would refuse to delete could still be offered in the picker, and the two answers to "is this
// key good" did not have to agree.
//
// The failure shape is deliberately loud. The old version caught everything into
// `{ error: "media_list_failed" }`, which the media page rendered as an empty library — so a gateway
// that was down looked exactly like a shop with no images, and an operator clearing a "missing" file
// was acting on a misconfiguration.
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { readThrough } from "@/lib/reads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MediaItem {
  url: string;
  key: string;
}

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "unauthorized" : "password_change_required" },
      { status: auth.status },
    );
  }
  try {
    const { items } = await readThrough<{ items: MediaItem[] }>("/media");
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // `readThrough` throws a plain `Error` carrying the gateway's own Persian sentence, so the message
    // survives but the status does not. The one case worth separating is a gateway that has no media
    // root configured, because that sentence names `MEDIA_LOCAL_ROOT` and an operator who sees it knows
    // exactly what to set; everything else is a genuine 500 from the panel's side of the wire.
    const message = error instanceof Error ? error.message : "media_list_failed";
    if (message.includes("MEDIA_LOCAL_ROOT")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: "media_list_failed" }, { status: 500 });
  }
}

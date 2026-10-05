// POST /api/admin/media/upload — forward the operator's file to the gateway.
//
// The panel used to decide whether a file was acceptable, mint a key and write the bytes itself. All
// three of those belong to the process that owns the media library, and two of them were outright wrong
// here: the key was generated in the panel while the *delete* that removes it lived in the gateway, and
// the write went to `public/media` resolved against the panel's own `process.cwd()` — a different
// directory from the gateway's `MEDIA_LOCAL_ROOT` whenever the two were started from different places.
// An upload could succeed and then be invisible to the storefront, with no error to say so.
//
// So this route now does the one thing only it can do — turn a browser's multipart body into bytes —
// and the gateway judges the type, checks the magic number, mints the key, writes the file and writes
// the audit line. The size cap stays here as a cheap refusal before the file is buffered at all; the
// gateway has its own, and this one is an optimisation rather than the rule.
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/auth/lib/auth";
import { GatewayError, panelGateway } from "@/lib/gateway";
import { sameOrigin } from "@/lib/origin";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_FILE_SIZE + 1024 * 1024;

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "unauthorized" : "password_change_required" },
      { status: auth.status },
    );
  }
  if (!sameOrigin(req)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });

  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_SIZE) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid multipart" }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file missing" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "invalid_file_size" }, { status: 413 });
  }

  try {
    // The content type travels as a header and nothing else. An extension is *not* sent: the gateway
    // derives it from the type, so a client that could name its own extension could ask to store a
    // `.jpg` as a `.html`. What comes back is the gateway's own key, so the panel has none to disagree
    // with — the file the operator sees in the library is the file the delete route will remove.
    const client = await panelGateway();
    const { url } = await client.post<{ url: string }>(
      "/media",
      await file.arrayBuffer(),
      { headers: { "content-type": file.type } },
    );
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // The gateway's own refusal is passed through rather than flattened. A 415 for "this is not
    // really a JPEG" and a 400 for "unsupported type" are different faults, and the old route reported
    // every one of them as `upload_failed` with a 500, which told the operator to retry a file that was
    // never going to be accepted.
    if (error instanceof GatewayError && error.statusCode >= 400 && error.statusCode < 500) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("media upload failed", error);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}

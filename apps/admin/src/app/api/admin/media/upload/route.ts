import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { mediaKey, saveMediaFile } from "@/lib/media";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_FILE_SIZE + 1024 * 1024;
// Do not trust a client filename or MIME alone. SVG/HTML and executable
// content are intentionally excluded because local fallback media is served
// from the admin origin.
const MIME_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["application/pdf", "pdf"],
]);

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

function hasExpectedSignature(bytes: Buffer, extension: string): boolean {
  if (extension === "jpg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === "png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === "gif") return bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a";
  if (extension === "webp") return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (extension === "avif") return bytes.subarray(4, 12).toString("ascii").includes("ftypavif");
  if (extension === "pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (extension === "mp4") return bytes.subarray(4, 8).toString("ascii") === "ftyp";
  if (extension === "webm") return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return false;
}

/** POST /api/admin/media/upload — multipart file → S3 (or public/media fallback) */
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
  const extension = MIME_EXTENSIONS.get(file.type.toLowerCase());
  if (!extension) {
    return NextResponse.json({ error: "نوع فایل مجاز نیست" }, { status: 415 });
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "invalid_file_size" }, { status: 413 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!hasExpectedSignature(bytes, extension)) return NextResponse.json({ error: "محتوای فایل با نوع آن مطابقت ندارد" }, { status: 415 });
    const url = await saveMediaFile(mediaKey(extension), bytes, file.type);
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("media upload failed", error);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}

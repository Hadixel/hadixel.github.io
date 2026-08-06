import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth";
import { mediaKey, saveMediaFile } from "@/lib/media";

export const runtime = "nodejs";

const ALLOWED = /^(image\/|video\/|application\/pdf)/;

/** POST /api/admin/media/upload — multipart file → S3 (or public/media fallback) */
export async function POST(req: Request) {
  const ctx = await getAdminUser();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
  if (!ALLOWED.test(file.type)) {
    return NextResponse.json({ error: "نوع فایل مجاز نیست" }, { status: 400 });
  }
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const bytes = Buffer.from(await file.arrayBuffer());
  const url = await saveMediaFile(mediaKey(ext || "bin"), bytes, file.type || "application/octet-stream");
  return NextResponse.json({ url });
}

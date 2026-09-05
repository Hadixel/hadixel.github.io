"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Media upload — fetch + refresh so the JSON endpoint response never replaces
// the page (plain form POST used to navigate to the raw {"url"} JSON).
export function MediaUpload() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await fetch("/api/admin/media/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "آپلود نشد");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "آپلود نشد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        name="file"
        className="text-sm text-ash"
        onChange={upload}
        disabled={busy}
      />
      {busy && <span className="text-sm text-ash">در حال آپلود…</span>}
      {err && <span className="text-sm text-red-600">{err}</span>}
    </div>
  );
}

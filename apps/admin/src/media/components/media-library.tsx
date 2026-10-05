"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteMedia } from "@/media/lib/media-actions";
import { idle, type ActionResult } from "@/lib/actions/result";
import { Card, CardContent, Input } from "@kmodern/ui";
import { EmptyState } from "@/components/panel-ui";

export function MediaLibrary({ items }: { items: Array<{ url: string; key: string }> }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(deleteMedia, idle);
  useEffect(() => {
    if (state.ok) router.refresh();
    // Narrowed on `ok`, which is the point of the union: the old `ActionState` had four optional
    // fields, so a failure with no message type-checked and set an empty string.
    if (!state.ok) setErr(state.error);
  }, [state, router]);

  const filtered = items.filter((it) => it.key.toLowerCase().includes(q.toLowerCase()));

  return (
    <Card>
      <CardContent>
        <div className="mb-4">
          <Input aria-label="جستجوی فایل‌های رسانه" placeholder="جستجوی فایل…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {err && <p role="alert" className="mb-3 notice-error">{err}</p>}
        {copied && <p role="status" aria-live="polite" className="mb-3 notice-success">آدرس کپی شد.</p>}
        {filtered.length === 0 ? (
          <EmptyState text="فایلی یافت نشد" />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            {filtered.map((it) => {
              const isImage = /\.(jpe?g|png|webp|gif|svg|avif)$/i.test(it.key);
              const isVideo = /\.(mp4|webm)$/i.test(it.key);
              return (
                <div key={it.key} className="overflow-hidden rounded-card border border-plaster">
                  <div className="flex h-28 items-center justify-center bg-plaster">
                    {isImage ? (
                      <img src={it.url} alt={it.key} loading="lazy" className="h-full w-full object-cover" />
                    ) : isVideo ? (
                      <span className="text-xs text-ash">ویدیو</span>
                    ) : (
                      <span className="text-xs text-ash">PDF</span>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="truncate text-micro text-ash" dir="ltr" title={it.key}>{it.key}</p>
                    <div className="mt-1 flex items-center justify-between gap-1">
                      <button
                        type="button"
                        className="text-micro text-flame-700 hover:underline"
                        onClick={async () => {
                          try {
                            if (!navigator.clipboard) throw new Error("clipboard unavailable");
                            await navigator.clipboard.writeText(it.url);
                            setCopied(it.key);
                            setErr(null);
                          } catch {
                            setCopied(null);
                            setErr("کپی آدرس ممکن نشد؛ آدرس را دستی کپی کنید.");
                          }
                        }}
                      >
                        کپی لینک
                      </button>
                      <form
                        action={formAction}
                        onSubmit={(e) => {
                          if (!confirm("حذف این فایل؟")) e.preventDefault();
                          else setDeleting(it.key);
                        }}
                      >
                        <input type="hidden" name="key" value={it.key} />
                        <button type="submit" disabled={pending && deleting === it.key} className="text-micro text-ink hover:text-flame-700">
                          حذف
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
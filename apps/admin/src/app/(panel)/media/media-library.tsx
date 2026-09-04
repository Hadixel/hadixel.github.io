"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteMediaAction } from "@/lib/actions/media";
import type { ActionState } from "@/lib/actions/auth";
import { Button, Card, CardBody, EmptyState, Input } from "@/components/ui";

export function MediaLibrary({ items }: { items: Array<{ url: string; key: string }> }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(deleteMediaAction, {});
  useEffect(() => {
    if (state.ok) router.refresh();
    if (state.error) setErr(state.error);
  }, [state, router]);

  const filtered = items.filter((it) => it.key.toLowerCase().includes(q.toLowerCase()));

  return (
    <Card>
      <CardBody>
        <div className="mb-4">
          <Input placeholder="جستجوی فایل…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {err && <p className="mb-3 rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
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
                      <img src={it.url} alt={it.key} className="h-full w-full object-cover" />
                    ) : isVideo ? (
                      <span className="text-xs text-ash">ویدیو</span>
                    ) : (
                      <span className="text-xs text-ash">PDF</span>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="truncate text-[11px] text-ash" dir="ltr" title={it.key}>{it.key}</p>
                    <div className="mt-1 flex items-center justify-between gap-1">
                      <button
                        type="button"
                        className="text-[11px] text-flame-700 hover:underline"
                        onClick={async () => {
                          await navigator.clipboard.writeText(it.url);
                          alert("آدرس کپی شد");
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
                        <button type="submit" disabled={pending && deleting === it.key} className="text-[11px] text-ink hover:text-flame-700">
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
      </CardBody>
    </Card>
  );
}
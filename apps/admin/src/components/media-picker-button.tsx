"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface MediaItem {
  url: string;
  key: string;
}

// "انتخاب از رسانه" button + modal grid. Picking a file fills the adjacent
// URL input (registered via onPick from the owning form component).
export function MediaPickerButton({
  label = "انتخاب از رسانه",
  onPick,
}: {
  label?: string;
  onPick: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[] | null>(null);

  useEffect(() => {
    if (!open || items) return;
    fetch("/api/admin/media")
      .then((r) => r.json())
      .then((j) => setItems(j.items ?? []))
      .catch(() => setItems([]));
  }, [open, items]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-card border border-fog px-3 py-1.5 text-sm text-ink transition hover:border-slate-line hover:bg-plaster"
      >
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-card bg-canvas p-5 shadow-[0_8px_24px_rgba(0,0,0,0.15)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-ink">انتخاب فایل رسانه</h3>
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1.5 text-sm hover:bg-plaster">✕</button>
            </div>
            {!items ? (
              <p className="py-10 text-center text-sm text-ash">در حال بارگذاری…</p>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-sm text-ash">فایلی موجود نیست — ابتدا از صفحه «رسانه» آپلود کنید.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {items.map((it) => {
                  const isImage = /\.(jpe?g|png|webp|gif|svg|avif)$/i.test(it.url);
                  return (
                    <button
                      key={it.key}
                      type="button"
                      onClick={() => { onPick(it.url); setOpen(false); }}
                      title={it.url}
                      className="group overflow-hidden rounded-card border border-plaster transition hover:border-flame-500"
                    >
                      {isImage ? (
                        <span className="relative block aspect-square bg-plaster">
                          <Image src={it.url} alt={it.key} fill sizes="140px" className="object-contain p-1" unoptimized />
                        </span>
                      ) : (
                        <span className="flex aspect-square items-center justify-center bg-plaster text-xs text-ash">{it.key.split(".").pop()}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

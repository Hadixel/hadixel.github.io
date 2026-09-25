"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@kmodern/ui";

interface MediaItem {
  url: string;
  key: string;
}

type LoadState = "idle" | "loading" | "ready" | "error";

// Accessible media picker with real dialog focus/Escape behavior and a
// distinct retryable error state instead of treating API failures as empty.
export function MediaPickerButton({
  label = "انتخاب از رسانه",
  onPick,
}: {
  label?: string;
  onPick: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [state, setState] = useState<LoadState>("idle");

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setState("loading");
    fetch("/api/admin/media", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "بارگذاری رسانه ناموفق بود");
        return body as { items?: MediaItem[] };
      })
      .then((body) => {
        setItems(Array.isArray(body.items) ? body.items : []);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState("error");
      });
    return () => controller.abort();
  }, [open]);

  const retry = () => {
    setState("idle");
    setOpen(false);
    requestAnimationFrame(() => setOpen(true));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-card border border-fog px-3 py-1.5 text-sm text-ink transition hover:border-slate-line hover:bg-plaster"
        >
          {label}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>انتخاب فایل رسانه</DialogTitle>
          <DialogDescription>یک فایل را برای قرار دادن در فرم انتخاب کنید.</DialogDescription>
        </DialogHeader>
        {state === "loading" || state === "idle" ? (
          <p className="py-10 text-center text-sm text-ash">در حال بارگذاری…</p>
        ) : state === "error" ? (
          <div className="py-8 text-center" role="alert">
            <p className="mb-3 text-sm text-red-700">بارگذاری فهرست رسانه ناموفق بود.</p>
            <button type="button" onClick={retry} className="rounded-card border border-fog px-3 py-1.5 text-sm hover:bg-plaster">
              تلاش دوباره
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-ash">فایلی موجود نیست — ابتدا از صفحه «رسانه» آپلود کنید.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {items.map((item) => {
              const isImage = /\.(jpe?g|png|webp|gif|svg|avif)$/i.test(item.url);
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    onPick(item.url);
                    setOpen(false);
                  }}
                  title={item.url}
                  aria-label={`انتخاب ${item.key}`}
                  className="group overflow-hidden rounded-card border border-plaster transition hover:border-flame-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame-300"
                >
                  {isImage ? (
                    <span className="relative block aspect-square bg-plaster">
                      <Image src={item.url} alt="" fill sizes="140px" className="object-contain p-1" unoptimized />
                    </span>
                  ) : (
                    <span className="flex aspect-square items-center justify-center bg-plaster text-xs text-ash">{item.key.split(".").pop()}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

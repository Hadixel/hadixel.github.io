"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toFaDigits } from "@kmodern/schema";
import Image from "next/image";

interface Hit {
  slug: string;
  name: string;
  price: number;
  maxPrice?: string;
  image: string | null;
}

const fa = (n: number) => toFaDigits(new Intl.NumberFormat("fa-IR").format(n));

/*
 * MobileSearchModal — search icon opens an overlay card with live results.
 * Debounced fetch to GET /api/search (the one search seam); Enter navigates
 * to the full listing; backdrop click and Escape close. Autofocused input.
 */
export default function MobileSearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else { setQ(""); setHits(null); setLoading(false); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits(null); setLoading(false); return; }
    setLoading(true);
    if (timer.current) clearTimeout(timer.current);
    const t: ReturnType<typeof setTimeout> = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const j = await r.json();
        setHits(j.results ?? []);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 280);
    timer.current = t;
    return () => clearTimeout(t);
  }, [q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 md:hidden" onClick={onClose} role="dialog" aria-modal="true" aria-label="جستجو">
      <div className="mx-4 mt-4 rounded-card border border-plaster bg-canvas p-4 shadow-[0_8px_24px_rgba(0,0,0,0.15)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && q.trim()) {
                onClose();
                router.push(`/products?q=${encodeURIComponent(q.trim())}`);
              }
            }}
            type="search"
            placeholder="جستجوی محصول…"
            aria-label="جستجوی محصول"
            className="h-11 flex-1 rounded-card border border-transparent bg-plaster px-4 text-sm text-ink outline-none placeholder:text-ash focus:border-fog focus:bg-canvas"
          />
          <button type="button" onClick={onClose} aria-label="بستن" className="rounded-card p-2 text-ash hover:bg-plaster hover:text-ink">✕</button>
        </div>

        <div className="mt-3 max-h-[60vh] overflow-y-auto">
          {loading && <p className="py-6 text-center text-sm text-ash">در حال جستجو…</p>}
          {!loading && q.trim().length >= 2 && hits?.length === 0 && (
            <p className="py-6 text-center text-sm text-ash">نتیجه‌ای یافت نشد</p>
          )}
          {!loading && hits && hits.length > 0 && (
            <ul className="divide-y divide-plaster">
              {hits.map((h) => (
                <li key={h.slug}>
                  <button
                    type="button"
                    onClick={() => { onClose(); router.push(`/product/${h.slug}`); }}
                    className="flex w-full items-center gap-3 py-2.5 text-right transition-colors hover:bg-plaster"
                  >
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-card bg-plaster">
                      {h.image && <Image src={h.image} alt="" fill sizes="48px" className="object-contain p-0.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{h.name}</span>
                      <span className="mt-0.5 block text-xs text-ash">{fa(h.price)} تومان{h.maxPrice ? ` تا ${fa(Number(h.maxPrice))} تومان` : ""}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && q.trim().length < 2 && (
            <p className="py-6 text-center text-xs text-ash">حداقل ۲ حرف بنویسید…</p>
          )}
        </div>
      </div>
    </div>
  );
}

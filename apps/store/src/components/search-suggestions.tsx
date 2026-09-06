"use client";

import { clearRecent, readRecent, rememberRecent } from "@/lib/recent-searches";
import { submitListing } from "@/lib/search-nav";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toFaDigits } from "@kmodern/schema";

interface Hit {
  slug: string;
  name: string;
  price: number;
  maxPrice?: number;
  image: string | null;
}

const fa = (n: number) => toFaDigits(new Intl.NumberFormat("fa-IR").format(n));
const chipClass = "rounded-card border border-fog px-3 py-1.5 text-xs text-ink transition-colors hover:border-slate-line hover:bg-plaster";

function TrendIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

/*
 * SearchSuggestions — the shared panel body (Digikala anatomy, RTL):
 * typed query → live product rows; empty query → recent searches,
 * popular terms (hot products), promo banner. Renders inside both the
 * desktop dropdown and the mobile overlay card.
 */
export default function SearchSuggestions({ query, onNavigate }: { query: string; onNavigate: () => void }) {
  const router = useRouter();
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [hot, setHot] = useState<Hit[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    setRecent(readRecent());
    fetch("/api/search?hot=1")
      .then((r) => r.json())
      .then((j) => setHot(j.results ?? []))
      .catch(() => setHot([]));
  }, []);

  const term = query.trim();

  // live results, debounced; hot-state shows whenever the query is short
  useEffect(() => {
    if (term.length < 2) { setHits(null); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const mySeq = ++seq.current;
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const j = await r.json();
        if (seq.current !== mySeq) return;
        setHits(j.results ?? []);
      } catch {
        if (seq.current === mySeq) setHits([]);
      } finally {
        if (seq.current === mySeq) setLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [term]);

  function goListing(t: string) {
    submitListing(router, t);
    onNavigate();
  }

  function goProduct(slug: string) {
    rememberRecent(term);
    onNavigate();
    router.push(`/product/${slug}`);
  }

  return (
    <div>
      {loading && <p className="py-6 text-center text-sm text-ash">در حال جستجو…</p>}
      {!loading && hits && hits.length === 0 && (
        <p className="py-6 text-center text-sm text-ash">نتیجه‌ای یافت نشد</p>
      )}
      {!loading && hits && hits.length > 0 && (
        <ul className="divide-y divide-plaster">
          {hits.map((h) => (
            <li key={h.slug}>
              <button
                type="button"
                onClick={() => goProduct(h.slug)}
                className="flex w-full items-center gap-3 py-2.5 text-right transition-colors hover:bg-plaster"
              >
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-card bg-plaster">
                  {h.image && <Image src={h.image} alt="" fill sizes="48px" className="object-contain p-0.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{h.name}</span>
                  <span className="mt-0.5 block text-xs text-ash">
                    {fa(h.price)} تومان{h.maxPrice ? ` تا ${fa(h.maxPrice)} تومان` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && !hits && (
        <div className="space-y-5">
          {recent.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-ink">جستجوهای اخیر</span>
                <button type="button" onClick={() => { clearRecent(); setRecent(readRecent()); }} className="text-xs text-ash transition-colors hover:text-flame-700">
                  پاک کردن
                </button>
              </div>
              <div className="flex flex-row-reverse flex-wrap gap-2">
                {recent.map((t) => (
                  <button key={t} type="button" onClick={() => goListing(t)} className={chipClass}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {hot.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-bold text-ink">جستجوهای پرطرفدار</div>
              <div className="flex flex-row-reverse flex-wrap gap-2">
                {hot.map((h) => (
                  <button
                    key={h.slug}
                    type="button"
                    onClick={() => goListing(h.name)}
                    className={`flex items-center gap-1.5 ${chipClass}`}
                  >
                    <TrendIcon />
                    <span className="max-w-28 truncate">{h.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <a href="/products" onClick={onNavigate} className="block overflow-hidden rounded-card bg-ink">
            <div className="relative flex h-24 items-center justify-between px-5">
              <div>
                <div className="text-sm font-bold text-white">دنبال تخفیف هستی؟</div>
                <div className="mt-1 text-xs text-white/70">همه محصولات را ببین</div>
              </div>
              <span className="rounded-[30px] bg-flame-700 px-4 py-1.5 text-xs font-bold text-white">خرید</span>
            </div>
          </a>
        </div>
      )}
    </div>
  );
}

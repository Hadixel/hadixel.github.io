"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/components/cart-provider";
import { formatToman, toFaDigits } from "@kmodern/schema";

interface Line {
  variantId: string;
  qty: number;
  sku: string;
  colorName: string;
  price: number;
  allowBackorder: boolean;
  productName: string;
  productSlug: string;
  image: string | null;
  lineTotal: number;
  available: boolean;
}

export default function CartPage() {
  const { lines, setQty, remove, add } = useCart();
  const [data, setData] = useState<{ lines: Line[]; subtotal: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRemoved, setLastRemoved] = useState<{ line: Line; qty: number } | null>(null);

  useEffect(() => {
    if (lines.length === 0) {
      setData({ lines: [], subtotal: 0 });
      setLoading(false);
      return;
    }
    fetch("/api/cart/enrich", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(lines) })
      .then((r) => r.json())
      .then((j) => { setData(j); })
      .finally(() => setLoading(false));
  }, [lines]);

  if (loading)
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 h-8 w-40 animate-pulse rounded-card bg-plaster" />
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <div key={i} className="flex gap-4 rounded-card border border-plaster bg-white p-4">
                <div className="size-24 animate-pulse rounded-card bg-plaster" />
                <div className="flex-1 space-y-3 py-1">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-plaster" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-plaster" />
                  <div className="h-8 w-40 animate-pulse rounded-card bg-plaster" />
                </div>
              </div>
            ))}
          </div>
          <div className="h-fit rounded-card border border-plaster p-6">
            <div className="h-6 w-24 animate-pulse rounded bg-plaster" />
          </div>
        </div>
      </div>
    );

  if (!data || data.lines.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-24 text-center">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden className="mx-auto text-fog">
          <path d="M3 3h2l2.4 12.4a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L21 7H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9.5" cy="20" r="1.4" fill="currentColor" />
          <circle cx="17" cy="20" r="1.4" fill="currentColor" />
        </svg>
        <h1 className="mt-6 font-display text-2xl font-extrabold">سبد خرید شما خالی است</h1>
        <p className="mt-3 text-sm text-ash">از میان فرهای توکار، اجاق‌گازها، هودها و سینک‌ها انتخاب کنید.</p>
        <Link href="/products" className="mt-8 inline-block rounded-card bg-flame-700 px-8 py-3 font-bold text-white transition hover:bg-flame-600">مشاهده محصولات</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-8 font-display text-3xl font-extrabold">سبد خرید</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {data.lines.map((l) => (
            <div key={l.variantId} className="flex gap-4 rounded-card border border-plaster bg-white p-4 transition-colors hover:border-flame-200">
              <Link href={`/product/${l.productSlug}`} className="relative size-24 shrink-0 overflow-hidden rounded-card bg-plaster">
                {/* white well — keeps photo whites from pasting on plaster */}
                <span aria-hidden className="absolute inset-1.5 rounded-[10px] bg-canvas ring-1 ring-fog/40" />
                {l.image ? <Image src={l.image} alt={l.productName} fill sizes="96px" className="object-contain p-1.5" /> : <span className="flex h-full items-center justify-center text-xs text-slate-line">بدون تصویر</span>}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <Link href={`/product/${l.productSlug}`} className="font-display font-bold leading-snug text-ink hover:text-flame-800">{l.productName}</Link>
                <div className="mt-1 text-xs text-ash">
                  {l.colorName}
                  <span className="mx-1.5 text-fog">·</span>
                  <span className="text-code">{l.sku}</span>
                </div>
                {!l.available && <div className="mt-1 text-xs font-medium text-red-500">موجودی کافی نیست</div>}
                <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                  <div className="flex items-center rounded-card border border-plaster">
                    <button className="px-3.5 py-1.5 text-ash transition hover:bg-plaster hover:text-ink" aria-label="کاهش تعداد" onClick={() => setQty(l.variantId, l.qty - 1)}>−</button>
                    <span className="min-w-8 text-center text-sm font-semibold">{toFaDigits(l.qty)}</span>
                    <button className="px-3.5 py-1.5 text-ash transition hover:bg-plaster hover:text-ink" aria-label="افزایش تعداد" onClick={() => setQty(l.variantId, l.qty + 1)}>+</button>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="whitespace-nowrap text-sm font-bold text-ink">{formatToman(l.lineTotal)}</span>
                    <button onClick={() => { setLastRemoved({ line: l, qty: l.qty }); remove(l.variantId); }} className="text-xs text-ash transition hover:text-red-600">حذف</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <aside className="h-fit rounded-card border border-plaster bg-canvas p-6 lg:sticky lg:top-24">
          <h2 className="font-display font-extrabold text-ink">خلاصه سفارش</h2>
          <div className="mt-4 flex justify-between text-sm">
            <span className="text-ash">جمع کالاها</span>
            <span className="font-bold text-ink">{formatToman(data.subtotal)}</span>
          </div>
          <div className="mt-1.5 text-xs leading-6 text-ash">هزینه ارسال در گام بعد محاسبه می‌شود.</div>
          <Link href="/checkout" className="mt-6 block rounded-card bg-flame-700 py-3 text-center font-bold text-white transition hover:bg-flame-600">
            ادامه و پرداخت
          </Link>
          <Link href="/products" className="mt-3 block text-center text-sm text-ash transition hover:text-flame-800">ادامه خرید</Link>
        </aside>
      </div>

      {lastRemoved && (
        <div className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit items-center gap-4 rounded-card border border-white/10 bg-ink px-5 py-3 text-sm text-white shadow-lg">
          <span>«{lastRemoved.line.productName}» از سبد حذف شد</span>
          <button
            onClick={() => {
              add(lastRemoved.line.variantId, lastRemoved.qty);
              setLastRemoved(null);
            }}
            className="font-bold text-flame-300 hover:text-flame-200"
          >
            بازگرداندن
          </button>
          <button onClick={() => setLastRemoved(null)} aria-label="بستن" className="text-white/60 hover:text-white">✕</button>
        </div>
      )}
    </div>
  );
}
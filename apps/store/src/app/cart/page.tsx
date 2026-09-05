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

  if (loading) return <div className="mx-auto max-w-4xl px-4 py-16 text-center">در حال بارگذاری…</div>;

  if (!data || data.lines.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">سبد خرید</h1>
        <p className="mt-4 text-ash">سبد شما خالی است.</p>
        <Link href="/products" className="mt-6 inline-block rounded-card bg-flame-700 px-8 py-3 font-bold text-white transition hover:bg-flame-600">مشاهده محصولات</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-8 text-2xl font-bold">سبد خرید</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {data.lines.map((l) => (
            <div key={l.variantId} className="flex gap-4 rounded-card border border-plaster bg-white p-4 transition-colors hover:border-flame-200">
              <Link href={`/product/${l.productSlug}`} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-card bg-plaster">
                {l.image ? <Image src={l.image} alt={l.productName} fill sizes="96px" className="object-contain" /> : <div className="flex h-full items-center justify-center text-slate-line">img</div>}
              </Link>
              <div className="flex flex-1 flex-col">
                <Link href={`/product/${l.productSlug}`} className="font-semibold text-ink">{l.productName}</Link>
                <div className="mt-1 text-sm text-ash">{l.colorName} · {toFaDigits(l.sku)}</div>
                {!l.available && <div className="mt-1 text-sm text-red-500">موجودی کافی نیست</div>}
                <div className="mt-auto flex items-center justify-between pt-3">
                  <div className="flex items-center rounded-card border border-plaster">
                    <button className="px-3.5 py-1.5 hover:bg-plaster" onClick={() => setQty(l.variantId, l.qty - 1)}>−</button>
                    <span className="min-w-8 text-center">{toFaDigits(l.qty)}</span>
                    <button className="px-3.5 py-1.5 hover:bg-plaster" onClick={() => setQty(l.variantId, l.qty + 1)}>+</button>
                  </div>
                  <button onClick={() => { setLastRemoved({ line: l, qty: l.qty }); remove(l.variantId); }} className="text-sm text-red-400 hover:text-red-600">حذف</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <aside className="h-fit rounded-card border border-plaster bg-canvas p-6">
          <div className="flex justify-between text-lg">
            <span>جمع کل</span>
            <span className="font-bold">{formatToman(data.subtotal)}</span>
          </div>
          <div className="mt-1 text-sm text-ash">هزینه ارسال در گام بعد محاسبه می‌شود.</div>
          <Link href="/checkout" className="mt-6 block rounded-card bg-flame-700 py-3 text-center font-bold text-white transition hover:bg-flame-600">
            ادامه و پرداخت
          </Link>
          <Link href="/products" className="mt-3 block text-center text-sm text-ash transition hover:text-flame-800">ادامه خرید</Link>
        </aside>
      </div>

      {lastRemoved && (
        <div className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit items-center gap-4 rounded-card border border-plaster bg-ink px-5 py-3 text-sm text-white shadow-lg">
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
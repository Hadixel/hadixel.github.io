"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/components/cart-provider";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { QuantityStepper } from "@/components/quantity-stepper";
import { StatusNotice } from "@/components/status-notice";
import { formatToman } from "@kmodern/schema";

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
  stock: number;
  reserved: number;
  available: boolean;
}

export default function CartPage() {
  const { lines, setQty, remove, add } = useCart();
  const [data, setData] = useState<{ lines: Line[]; subtotal: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastRemoved, setLastRemoved] = useState<{ line: Line; qty: number } | null>(null);

  useEffect(() => {
    if (lines.length === 0) {
      setData({ lines: [], subtotal: 0 });
      setLoading(false);
      setError(null);
      setNotice(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/cart/enrich", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(lines),
    })
      .then((response) => {
        if (!response.ok) throw new Error("cart-enrich");
        return response.json();
      })
      .then((json: { lines: Line[]; subtotal: number; rejectedVariantIds?: string[] }) => {
        if (cancelled) return;
        if (json.rejectedVariantIds?.length) {
          json.rejectedVariantIds.forEach((variantId) => remove(variantId));
          setNotice("چند کالای ناموجود از سبد حذف شدند. لطفاً خلاصه سفارش را دوباره بررسی کنید.");
        }
        setData({ lines: json.lines, subtotal: json.subtotal });
      })
      .catch(() => {
        if (!cancelled) setError("سبد خرید در این لحظه بارگذاری نشد. دوباره تلاش کنید.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [lines, remove]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 h-10 w-40 animate-pulse rounded-card bg-plaster" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            {[0, 1].map((item) => (
              <div key={item} className="flex gap-4 rounded-card bg-plaster p-4">
                <div className="size-24 animate-pulse rounded-card bg-fog/60" />
                <div className="flex-1 space-y-3 py-1">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-fog/60" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-fog/60" />
                  <div className="h-10 w-36 animate-pulse rounded-card bg-fog/60" />
                </div>
              </div>
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-card bg-plaster" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <StatusNotice tone="danger" title="بارگذاری سبد خرید ناموفق بود" role="alert">
          {error}
          <button type="button" onClick={() => setQty(lines[0]?.variantId ?? "", lines[0]?.qty ?? 1)} className="mr-2 font-bold underline underline-offset-4">
            تلاش دوباره
          </button>
        </StatusNotice>
      </div>
    );
  }

  if (!data || data.lines.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <EmptyState
          title="سبد خرید شما خالی است"
          description="محصولات مناسب آشپزخانه‌تان را پیدا کنید؛ انتخاب‌های شما تا پایان خرید در همین سبد باقی می‌مانند."
          action={{ label: "مشاهده محصولات", href: "/products" }}
          icon={
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 2-1.6L21 7H6" />
              <circle cx="9" cy="20" r="1.3" fill="currentColor" /><circle cx="17" cy="20" r="1.3" fill="currentColor" />
            </svg>
          }
        />
      </div>
    );
  }

  const canCheckout = data.lines.every((line) => line.available);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <PageHeader title="سبد خرید" description="پیش از ادامه، تعداد و مشخصات کالاهای انتخاب‌شده را مرور کنید." />
      {notice && <div className="mb-5"><StatusNotice tone="warning" role="status">{notice}</StatusNotice></div>}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {data.lines.map((line) => (
            <article key={line.variantId} className="rounded-card bg-plaster/70 p-4 transition-colors hover:bg-plaster">
              <div className="flex gap-4">
                <Link href={`/product/${line.productSlug}`} className="relative size-24 shrink-0 overflow-hidden rounded-card bg-canvas sm:size-28" aria-label={`مشاهده ${line.productName}`}>
                  {line.image ? (
                    <Image src={line.image} alt={line.productName} fill sizes="112px" className="object-contain p-2 mix-blend-multiply" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-xs text-slate-line">بدون تصویر</span>
                  )}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/product/${line.productSlug}`} className="line-clamp-2 font-bold leading-7 text-ink transition-colors hover:text-flame-800">
                        {line.productName}
                      </Link>
                      <div className="mt-1 text-xs text-ash">
                        {line.colorName}
                        <span className="mx-1.5 text-fog" aria-hidden>·</span>
                        <span className="text-code">{line.sku}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setLastRemoved({ line, qty: line.qty }); remove(line.variantId); }}
                      className="flex size-9 shrink-0 items-center justify-center rounded-card text-ash transition-colors hover:bg-canvas hover:text-red-700"
                      aria-label={`حذف ${line.productName}`}
                    >
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M4 7h16M9 7V4h6v3M8 10v8M12 10v8M16 10v8M6 7l1 14h10l1-14" />
                      </svg>
                    </button>
                  </div>

                  {!line.available && (
                    <div className="mt-3">
                      <StatusNotice tone="warning">موجودی کافی نیست؛ تعداد یا رنگ این کالا را بازبینی کنید.</StatusNotice>
                    </div>
                  )}

                  <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-4">
                    <QuantityStepper value={line.qty} onChange={(value) => setQty(line.variantId, value)} max={line.allowBackorder ? 99 : Math.max(1, line.stock - line.reserved)} compact />
                    <div className="text-left">
                      {line.qty > 1 && <div className="mb-1 text-xs text-ash">قیمت واحد: {formatToman(line.price)}</div>}
                      <div className="font-bold tabular-nums text-ink">{formatToman(line.lineTotal)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <aside className="store-sticky rounded-card bg-canvas p-6 shadow-[var(--overlay-shadow)]">
          <h2 className="font-display text-xl font-black text-ink">خلاصه سفارش</h2>
          <div className="mt-5 flex items-center justify-between gap-3 border-b border-plaster pb-4 text-sm">
            <span className="text-ash">جمع کالاها</span>
            <span className="font-bold tabular-nums text-ink">{formatToman(data.subtotal)}</span>
          </div>
          {!canCheckout && <div className="mt-4"><StatusNotice tone="warning">برای ادامه، تعداد یا موجودی کالاهای مشخص‌شده را اصلاح کنید.</StatusNotice></div>}
          <p className="mt-4 text-xs leading-6 text-ash">هزینه ارسال پس از ثبت آدرس در گام تسویه حساب محاسبه می‌شود.</p>
          <Link href="/checkout" aria-disabled={!canCheckout} tabIndex={canCheckout ? undefined : -1} className={`mt-6 flex min-h-12 items-center justify-center rounded-card px-5 font-bold transition-colors ${canCheckout ? "bg-flame-700 text-white hover:bg-flame-600" : "pointer-events-none bg-fog text-ash"}`}>
            ادامه و پرداخت
          </Link>
          <Link href="/products" className="mt-3 flex min-h-11 items-center justify-center text-sm font-semibold text-ash transition-colors hover:text-flame-800">
            ادامه خرید
          </Link>
        </aside>
      </div>

      {lastRemoved && (
        <div className="fixed inset-x-0 bottom-5 z-40 mx-auto flex w-[min(92vw,560px)] items-center justify-between gap-4 rounded-card bg-ink px-4 py-3 text-sm text-white shadow-[var(--overlay-shadow)]" role="status">
          <span className="min-w-0 truncate">«{lastRemoved.line.productName}» از سبد حذف شد</span>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => {
                add(lastRemoved.line.variantId, lastRemoved.qty);
                setLastRemoved(null);
              }}
              className="font-bold text-flame-300 hover:text-flame-200"
            >
              بازگرداندن
            </button>
            <button type="button" onClick={() => setLastRemoved(null)} aria-label="بستن" className="text-white/60 hover:text-white">×</button>
          </div>
        </div>
      )}
    </div>
  );
}

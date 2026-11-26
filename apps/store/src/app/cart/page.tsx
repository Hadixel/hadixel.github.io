"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/cart/components/cart-provider";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { QuantityStepper } from "@/cart/components/quantity-stepper";
import { StatusNotice } from "@/components/status-notice";
import { formatToman } from "@kmodern/contracts/format";
import { ShimmerImage, AppliancePlaceholder } from "@/components/shimmer-image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@kmodern/ui";

interface Line {
  variantId: string;
  qty: number;
  sku: string | null;
  colorName: string | null;
  price: number;
  allowBackorder?: boolean;
  productName: string;
  slug?: string;
  productSlug?: string;
  image: string | null;
  lineTotal: number;
  stock?: number;
  reserved?: number;
  available: boolean;
  maxAddable?: number;
}

export default function CartPage() {
  const { lines, setQty, remove, add, hydrated } = useCart();
  const [data, setData] = useState<{ lines: Line[]; subtotal: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastRemoved, setLastRemoved] = useState<{ line: Line; qty: number } | null>(null);
  const [pendingDeleteLine, setPendingDeleteLine] = useState<Line | null>(null);
  const [retryIndex, setRetryIndex] = useState(0);

  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (!hydrated) return;

    if (lines.length === 0) {
      setData({ lines: [], subtotal: 0 });
      setLoading(false);
      setValidating(false);
      setError(null);
      setNotice(null);
      return;
    }

    let cancelled = false;
    // Only show full-page skeleton on initial load when data === null.
    // When data is already present, do NOT set loading=true. Keep the cart UI mounted smoothly.
    if (dataRef.current === null) {
      setLoading(true);
    } else {
      setValidating(true);
    }
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
        if (!cancelled) {
          setLoading(false);
          setValidating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, lines, remove, retryIndex]);

  const handleQuantityChange = (variantId: string, value: number) => {
    setQty(variantId, value);
    // Optimistically update data.lines quantity and lineTotal immediately:
    setData((prev) => {
      if (!prev) return prev;
      const nextLines = prev.lines.map((l) => {
        if (l.variantId !== variantId) return l;
        const qty = value;
        const lineTotal = l.price * qty;
        return { ...l, qty, lineTotal };
      });
      const subtotal = nextLines.reduce((acc, l) => acc + l.lineTotal, 0);
      return { ...prev, lines: nextLines, subtotal };
    });
  };

  const handleRemove = (line: Line) => {
    setLastRemoved({ line, qty: line.qty });
    remove(line.variantId);
    // Optimistically update data immediately:
    setData((prev) => {
      if (!prev) return prev;
      const nextLines = prev.lines.filter((l) => l.variantId !== line.variantId);
      const subtotal = nextLines.reduce((acc, l) => acc + l.lineTotal, 0);
      return { ...prev, lines: nextLines, subtotal };
    });
  };

  const handleRestore = () => {
    if (!lastRemoved) return;
    add(lastRemoved.line.variantId, lastRemoved.qty);
    setData((prev) => {
      if (!prev) return prev;
      const restored: Line = {
        ...lastRemoved.line,
        qty: lastRemoved.qty,
        lineTotal: lastRemoved.line.price * lastRemoved.qty,
      };
      const nextLines = [...prev.lines, restored];
      const subtotal = nextLines.reduce((acc, l) => acc + l.lineTotal, 0);
      return { ...prev, lines: nextLines, subtotal };
    });
    setLastRemoved(null);
  };

  // Only show full-page skeleton on initial load when data === null
  if (loading && data === null) {
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

  if (error && data === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <StatusNotice tone="danger" title="بارگذاری سبد خرید ناموفق بود" role="alert">
          {error}
          <button
            type="button"
            onClick={() => setRetryIndex((i) => i + 1)}
            className="mr-2 font-bold underline underline-offset-4"
          >
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
        {lastRemoved && (
          <div className="fixed inset-x-0 bottom-5 z-40 mx-auto flex w-[min(92vw,560px)] items-center justify-between gap-4 rounded-card bg-ink px-4 py-3 text-sm text-white shadow-[var(--overlay-shadow)]" role="status">
            <span className="min-w-0 truncate">«{lastRemoved.line.productName}» از سبد حذف شد</span>
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={handleRestore}
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

  const canCheckout = data.lines.every((line) => line.available);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <PageHeader
        title="سبد خرید"
        description="پیش از ادامه، تعداد و مشخصات کالاهای انتخاب‌شده را مرور کنید."
        actions={
          validating ? (
            <span className="inline-flex items-center gap-2 rounded-card bg-plaster/90 px-3 py-1.5 text-xs font-medium text-ash" role="status">
              <span className="size-2 rounded-full bg-flame-700 animate-pulse" />
              در حال به‌روزرسانی سبد...
            </span>
          ) : null
        }
      />
      {error && <div className="mb-5"><StatusNotice tone="danger" role="alert">{error}</StatusNotice></div>}
      {notice && <div className="mb-5"><StatusNotice tone="warning" role="status">{notice}</StatusNotice></div>}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {data.lines.map((line) => {
            const productHref = `/product/${line.slug || line.productSlug || ""}`;
            const itemMax =
              typeof line.maxAddable === "number" && Number.isFinite(line.maxAddable) && line.maxAddable > 0
                ? line.maxAddable
                : line.allowBackorder
                ? 99
                : Math.max(1, (line.stock ?? 0) - (line.reserved ?? 0));

            return (
              <article key={line.variantId} className="rounded-card bg-plaster/70 p-4 transition-colors hover:bg-plaster">
                <div className="flex gap-4">
                  <Link href={productHref} className="relative size-24 shrink-0 overflow-hidden rounded-card bg-canvas sm:size-28" aria-label={`مشاهده ${line.productName}`}>
                    {line.image ? (
                      <ShimmerImage src={line.image} alt={line.productName} fill sizes="(max-width: 640px) 96px, 112px" className="object-contain p-2 mix-blend-multiply" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <AppliancePlaceholder className="size-8 text-ash/40" />
                      </div>
                    )}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={productHref} className="line-clamp-2 font-bold leading-7 text-ink transition-colors hover:text-flame-800">
                          {line.productName}
                        </Link>
                        <div className="mt-1 text-xs text-ash">
                          {line.colorName}
                          {line.sku && (
                            <>
                              <span className="mx-1.5 text-fog" aria-hidden>·</span>
                              <span className="text-code">{line.sku}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteLine(line)}
                        className="flex size-9 shrink-0 items-center justify-center rounded-card text-ash transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 focus-visible:text-red-600"
                        aria-label={`حذف ${line.productName} از سبد خرید`}
                        title="حذف از سبد خرید"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          <line x1="10" x2="10" y1="11" y2="17" />
                          <line x1="14" x2="14" y1="11" y2="17" />
                        </svg>
                      </button>
                    </div>

                    {!line.available && (
                      <div className="mt-3">
                        <StatusNotice tone="warning">موجودی کافی نیست؛ تعداد یا رنگ این کالا را بازبینی کنید.</StatusNotice>
                      </div>
                    )}

                    <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-4">
                      <QuantityStepper
                        value={line.qty}
                        onChange={(value) => handleQuantityChange(line.variantId, value)}
                        max={itemMax}
                        compact
                      />
                      <div className="text-left">
                        {line.qty > 1 && <div className="mb-1 text-xs text-ash">قیمت واحد: {formatToman(line.price)}</div>}
                        <div className={`text-base sm:text-lg font-bold tabular-nums text-ink transition-opacity ${validating ? "opacity-75" : "opacity-100"}`}>
                          {formatToman(line.lineTotal)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="store-sticky rounded-card bg-canvas p-6 shadow-[var(--overlay-shadow)]">
          <h2 className="font-display text-xl font-black text-ink">خلاصه سفارش</h2>
          <div className="mt-5 flex items-center justify-between gap-3 border-b border-plaster pb-4 text-sm">
            <span className="text-ash">جمع کالاها</span>
            <span className={`text-base sm:text-lg font-bold tabular-nums text-ink transition-opacity ${validating ? "opacity-75" : "opacity-100"}`}>
              {formatToman(data.subtotal)}
            </span>
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
              onClick={handleRestore}
              className="font-bold text-flame-300 hover:text-flame-200"
            >
              بازگرداندن
            </button>
            <button type="button" onClick={() => setLastRemoved(null)} aria-label="بستن" className="text-white/60 hover:text-white">×</button>
          </div>
        </div>
      )}

      <Dialog
        open={Boolean(pendingDeleteLine)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteLine(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>حذف کالا از سبد خرید</DialogTitle>
            <DialogDescription>
              آیا از حذف «{pendingDeleteLine?.productName}» از سبد خرید مطمئن هستید؟
            </DialogDescription>
          </DialogHeader>

          {pendingDeleteLine && (
            <div className="flex items-center gap-3.5 rounded-card border border-plaster bg-plaster/60 p-3.5">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-card bg-canvas border border-plaster">
                {pendingDeleteLine.image ? (
                  <ShimmerImage
                    src={pendingDeleteLine.image}
                    alt={pendingDeleteLine.productName}
                    fill
                    sizes="64px"
                    className="object-contain p-1.5 mix-blend-multiply"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <AppliancePlaceholder className="size-6 text-ash/40" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-bold text-ink">
                  {pendingDeleteLine.productName}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ash">
                  {pendingDeleteLine.colorName && (
                    <span>رنگ: {pendingDeleteLine.colorName}</span>
                  )}
                  {pendingDeleteLine.colorName && pendingDeleteLine.sku && (
                    <span className="text-fog">·</span>
                  )}
                  {pendingDeleteLine.sku && (
                    <span className="text-code">{pendingDeleteLine.sku}</span>
                  )}
                  <span className="text-fog">·</span>
                  <span>تعداد: {pendingDeleteLine.qty} عدد</span>
                </div>
                <div className="mt-1.5 text-xs font-bold tabular-nums text-ink">
                  {formatToman(pendingDeleteLine.lineTotal)}
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center justify-end gap-3">
            <DialogClose asChild>
              <button
                type="button"
                className="rounded-card border border-plaster bg-canvas px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-plaster focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame-200"
              >
                انصراف
              </button>
            </DialogClose>
            <button
              type="button"
              onClick={() => {
                if (pendingDeleteLine) {
                  const lineToRemove = pendingDeleteLine;
                  setPendingDeleteLine(null);
                  handleRemove(lineToRemove);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-bold rounded-card px-4 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 text-sm"
            >
              حذف از سبد خرید
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

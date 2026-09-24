"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@heroui/react";
import { ProductGallery, cn } from "@kmodern/ui";
import { formatToman, toFaDigits } from "@kmodern/schema";
import { useCart } from "./cart-provider";
import { QuantityStepper } from "./quantity-stepper";

type ProductVariant = {
  id: string;
  colorName: string;
  colorCode: string | null;
  sku: string;
  price: number;
  images: string[];
  stock: number;
  reserved: number;
  allowBackorder: boolean;
  available: boolean;
};

export function ProductBuyBox({
  variants,
  productName,
  model,
  description,
  details,
}: {
  variants: ProductVariant[];
  productName: string;
  model?: string;
  description?: string | null;
  details?: React.ReactNode;
}) {
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const { add } = useCart();
  const selected = variants.find((variant) => variant.id === selectedId) ?? variants[0];
  const maxQuantity = selected?.allowBackorder ? 99 : Math.max(1, (selected?.stock ?? 0) - (selected?.reserved ?? 0));
  const lowStock = selected?.available && !selected.allowBackorder && selected.stock - selected.reserved <= 3;

  function addToCart() {
    if (!selected?.available) return;
    add(selected.id, qty);
    setAdded(true);
  }

  return (
    <>
      <div className="product-layout">
        <div className="product-media">
          <ProductGallery images={selected?.images ?? []} alt={productName} />
        </div>

        <aside className="product-purchase store-sticky" aria-label="خرید محصول">
          <div className="rounded-card bg-plaster/70 p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {model ? <span className="text-code text-xs text-ash">{model}</span> : <span />}
              <span className={cn(
                "inline-flex items-center gap-2 rounded-[30px] px-2.5 py-1 text-xs font-semibold",
                selected?.available ? "bg-flame-50 text-flame-800" : "bg-canvas text-ash",
              )}>
                <span className={cn("size-1.5 rounded-[30px]", selected?.available ? "bg-flame-700" : "bg-slate-line")} aria-hidden />
                {selected?.available ? (selected.allowBackorder ? "قابل سفارش" : "موجود در انبار") : "ناموجود"}
              </span>
            </div>

            <h1 className="mt-3 text-balance font-display text-3xl font-black leading-tight text-ink sm:text-4xl">{productName}</h1>
            {selected?.sku && <div className="mt-2 text-xs text-ash">کد کالا: <span className="text-code">{selected.sku}</span></div>}

            {variants.length > 1 && (
              <fieldset className="mt-7">
                <legend className="text-sm font-bold text-ink">رنگ: <span className="font-normal text-ash">{selected?.colorName}</span></legend>
                <div className="mt-3 flex flex-row-reverse flex-wrap gap-3">
                  {variants.map((variant) => {
                    const active = variant.id === selected?.id;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        aria-label={`رنگ ${variant.colorName}${variant.available ? "" : "، ناموجود"}`}
                        aria-pressed={active}
                        disabled={!variant.available}
                        onClick={() => {
                          setSelectedId(variant.id);
                          setQty(1);
                          setAdded(false);
                        }}
                        className={cn(
                          "relative size-9 rounded-[30px] border transition",
                          active ? "border-2 border-flame-700 ring-2 ring-flame-100" : "border-fog hover:border-slate-line",
                          !variant.available && "cursor-not-allowed opacity-35",
                        )}
                        style={variant.colorCode ? { backgroundColor: variant.colorCode } : { backgroundColor: "#d7d7d7" }}
                      >
                        {!variant.colorCode && <span className="absolute inset-2 rounded-[30px] bg-canvas" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <div className="mt-7 border-t border-fog pt-6">
              {selected?.available ? (
                <>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="text-xs text-ash">مبلغ محصول</div>
                      <div className="mt-1 font-display text-3xl font-black tabular-nums text-ink">{formatToman(selected.price)}</div>
                    </div>
                    {lowStock && <span className="text-xs font-semibold text-flame-800">تنها {toFaDigits(selected.stock - selected.reserved)} عدد باقی مانده</span>}
                  </div>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <QuantityStepper value={qty} onChange={setQty} max={maxQuantity} />
                    <Button
                      className="min-h-11 flex-1"
                      variant={added ? "secondary" : "primary"}
                      isDisabled={added}
                      onPress={addToCart}
                    >
                      {added ? "به سبد اضافه شد ✓" : "افزودن به سبد خرید"}
                    </Button>
                  </div>
                </>
              ) : (
                <div>
                  <div className="font-display text-2xl font-black text-ash">ناموجود</div>
                  <p className="mt-2 text-sm leading-7 text-ash">برای اطلاع از زمان موجود شدن محصول با پشتیبانی فروشگاه تماس بگیرید.</p>
                  <Button variant="outline" isDisabled className="mt-5 w-full">ناموجود</Button>
                </div>
              )}

              {added && (
                <Link href="/cart" className="mt-3 flex min-h-11 items-center justify-center rounded-card border border-flame-200 bg-flame-50 px-4 text-sm font-bold text-flame-800 transition-colors hover:bg-flame-100">
                  مشاهده سبد خرید
                </Link>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-3 text-xs text-ash sm:grid-cols-3 lg:grid-cols-1">
            <div className="flex items-center gap-3 rounded-card bg-canvas px-4 py-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /></svg>
              ارسال سراسری
            </div>
            <div className="flex items-center gap-3 rounded-card bg-canvas px-4 py-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3 20 6v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></svg>
              ضمانت اصالت کالا
            </div>
            <div className="flex items-center gap-3 rounded-card bg-canvas px-4 py-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h11a2 2 0 0 1 2 2v7H6a2 2 0 0 1-2-2V7Z" /><path d="M17 10h3l1 3v3h-4M9 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /></svg>
              امکان بازگشت کالا
            </div>
          </div>
        </aside>

        <div className="product-details">
          <section className="rounded-card bg-canvas p-5 sm:p-7" aria-labelledby="product-about-title">
            <h2 id="product-about-title" className="font-display text-xl font-black text-ink">معرفی محصول</h2>
            <p className="mt-4 text-sm leading-8 text-ash">{description || "برای این محصول توضیح تکمیلی ثبت نشده است."}</p>
          </section>
          {details}
        </div>
      </div>

      {selected?.available && (
        <div className="mobile-purchase-bar fixed inset-x-0 bottom-0 z-30 border-t border-plaster bg-canvas/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(17,17,17,0.08)] backdrop-blur-md lg:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-ash">{productName}</div>
              <div className="mt-0.5 truncate text-sm font-black tabular-nums text-ink">{formatToman(selected.price)}</div>
            </div>
            <Button className="min-h-11 min-w-40" variant={added ? "secondary" : "primary"} isDisabled={added} onPress={addToCart}>
              {added ? "اضافه شد ✓" : "افزودن به سبد"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

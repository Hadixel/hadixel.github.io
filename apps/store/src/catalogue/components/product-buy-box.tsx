"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@heroui/react";
import { Badge, ProductGallery, cn } from "@kmodern/ui";
import { formatToman, toFaDigits } from "@kmodern/contracts/format";
import { useCart } from "@/cart/components/cart-provider";
import { QuantityStepper } from "@/cart/components/quantity-stepper";

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
  detailsSummary,
  discount,
}: {
  variants: ProductVariant[];
  productName: string;
  model?: string;
  description?: string | null;
  details?: React.ReactNode;
  detailsSummary?: string;
  /** The gateway's price cut for this product: `label` is already formatted for the badge and
      `variantPrices` carries every variant id at its discounted price. Null when nothing is
      discounted; a variant id absent from the record is simply not discounted. */
  discount?: { label: string; endsAt: string | null; variantPrices: Record<string, number> } | null;
}) {
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const { add } = useCart();
  const selected = variants.find((variant) => variant.id === selectedId) ?? variants[0];
  // The gateway's price for the selected colour, if it priced one: a colour missing from the
  // record, or no discount at all, leaves this `null` and both price zones render as they always
  // have. Computed once here so the desktop zone and the mobile bar cannot disagree about it.
  const variantDiscount =
    selected && discount && typeof discount.variantPrices[selected.id] === "number"
      ? { price: discount.variantPrices[selected.id], label: discount.label }
      : null;
  // Every variant's shots, de-duplicated, in variant order — the rail shows all
  // colours; the dots only choose which shot the main stage opens on.
  const allImages = useMemo(() => [...new Set(variants.flatMap((v) => v.images))], [variants]);
  const maxQuantity = selected?.allowBackorder ? 99 : Math.max(1, (selected?.stock ?? 0) - (selected?.reserved ?? 0));
  const lowStock = selected?.available && !selected.allowBackorder && selected.stock - selected.reserved <= 3;
  const descriptionText = description || "برای این محصول توضیح تکمیلی ثبت نشده است.";
  // The clamp is pure CSS so the text stays in the accessibility tree; the
  // toggle only appears once the box is known to actually clip something.
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionOverflows, setDescriptionOverflows] = useState(false);

  useLayoutEffect(() => {
    const node = descriptionRef.current;
    if (!node) return;
    const measure = () => {
      if (descriptionExpanded) return;
      setDescriptionOverflows(node.scrollHeight - node.clientHeight > 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [descriptionText, descriptionExpanded]);

  function addToCart() {
    if (!selected?.available) return;
    add(selected.id, qty);
    setAdded(true);
  }

  return (
    <>
      <div className="product-layout">
        <div className="product-media">
          <ProductGallery images={allImages} initialImage={selected?.images[0]} alt={productName} />
        </div>

        <aside className="product-purchase store-sticky" aria-label="خرید محصول">
          <div className="product-summary rounded-card border border-plaster bg-canvas p-5 shadow-[0_12px_32px_rgba(17,17,17,0.06)] sm:p-7">
            <div className="product-summary-top">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ash">
                {model && <span className="text-code">{model}</span>}
                {selected?.sku && <span>کد کالا: <span className="text-code">{selected.sku}</span></span>}
              </div>
              <span className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-pill px-3 py-1.5 text-xs font-semibold",
                selected?.available ? "bg-flame-50 text-flame-800" : "bg-plaster text-ash",
              )}>
                <span className={cn("size-1.5 rounded-pill", selected?.available ? "bg-flame-700" : "bg-slate-line")} aria-hidden />
                {selected?.available ? (selected.allowBackorder ? "قابل سفارش" : "موجود در انبار") : "ناموجود"}
              </span>
            </div>

            <h1 className="product-title mt-6 text-balance font-display text-3xl font-black leading-tight text-ink sm:text-4xl">{productName}</h1>

            <h2 className="mt-5 text-sm font-bold text-ink">توضیحات محصول</h2>
            <p
              id="product-description"
              ref={descriptionRef}
              className="product-description product-description-text mt-2 text-sm leading-8 text-ash"
              data-clamped={!descriptionExpanded && descriptionOverflows}
              data-expanded={descriptionExpanded}
            >
              {descriptionText}
            </p>
            {(descriptionOverflows || descriptionExpanded) && (
              <button
                type="button"
                aria-expanded={descriptionExpanded}
                aria-controls="product-description"
                onClick={() => setDescriptionExpanded((current) => !current)}
                className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-bold text-ash transition-colors hover:text-ink"
              >
                {descriptionExpanded ? "کمتر" : "بیشتر"}
                <svg
                  className={cn("product-description-caret size-3.5 transition-transform duration-200", descriptionExpanded && "rotate-180")}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            )}
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
                          "relative size-11 rounded-pill border p-1 transition",
                          active ? "border-2 border-flame-700 ring-2 ring-flame-100" : "border-fog hover:border-slate-line",
                          !variant.available && "cursor-not-allowed opacity-35",
                        )}
                      >
                        <span
                          className="absolute inset-1 rounded-pill"
                          style={{ backgroundColor: variant.colorCode ?? "var(--color-fog)" }}
                          aria-hidden
                        />
                        {!variant.colorCode && <span className="absolute inset-2 rounded-pill bg-canvas" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {/* Below lg the fixed bottom bar owns price, quantity and the add-to-cart action. */}
            <div className={cn("product-price-zone mt-7 border-t border-fog pt-6", selected?.available && "hidden lg:block")}>
              {selected?.available ? (
                <>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <div className="text-xs text-ash">مبلغ محصول</div>
                      {/* The gateway's price for this colour leads; the sticker price it was cut
                          from is struck beside it, and the label carries its own sign. */}
                      {variantDiscount ? (
                        <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
                          <span className="font-display text-3xl font-black tabular-nums text-ink">{formatToman(variantDiscount.price)}</span>
                          <s className="text-sm tabular-nums text-slate-line">{formatToman(selected.price)}</s>
                          <Badge variant="flame">{variantDiscount.label}</Badge>
                        </div>
                      ) : (
                        <div className="mt-1 font-display text-3xl font-black tabular-nums text-ink">{formatToman(selected.price)}</div>
                      )}
                    </div>
                    {lowStock && <span className="text-xs font-semibold text-flame-800">تنها {toFaDigits(selected.stock - selected.reserved)} عدد باقی مانده</span>}
                  </div>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <QuantityStepper value={qty} onChange={setQty} max={maxQuantity} />
                    <Button
                      className="min-h-12 flex-1"
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

            <div className="product-assurances mt-6 grid grid-cols-2 items-center gap-x-4 gap-y-3 border-t border-plaster pt-5 text-xs text-ash">
              <div className="product-assurance">
                <span className="product-assurance-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /></svg>
                </span>
                <span>ارسال سراسری</span>
              </div>
              <div className="product-assurance">
                <span className="product-assurance-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3 20 6v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></svg>
                </span>
                <span>ضمانت اصالت کالا</span>
              </div>
            </div>
          </div>
        </aside>

      </div>

      {details && (
        <section className="product-details" aria-label={detailsSummary ?? "جزئیات محصول"}>
          {details}
        </section>
      )}

      {selected?.available && (
        <div className="mobile-purchase-bar product-mobile-bar fixed inset-x-0 bottom-0 z-30 border-t border-plaster bg-canvas/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(17,17,17,0.08)] backdrop-blur-md lg:hidden">
          <div className="mx-auto flex max-w-lg flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-xs text-ash">{productName}</span>
              {variantDiscount ? (
                <span className="flex shrink-0 flex-wrap items-baseline justify-end gap-x-2 gap-y-1">
                  <span className="font-black tabular-nums text-ink">{formatToman(variantDiscount.price)}</span>
                  <s className="text-xs tabular-nums text-slate-line">{formatToman(selected.price)}</s>
                  <Badge variant="flame">{variantDiscount.label}</Badge>
                </span>
              ) : (
                <span className="shrink-0 font-black tabular-nums text-ink">{formatToman(selected.price)}</span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <QuantityStepper value={qty} onChange={setQty} max={maxQuantity} compact />
              <Button className="min-h-11 flex-1" variant={added ? "secondary" : "primary"} isDisabled={added} onPress={addToCart}>
                {added ? "به سبد اضافه شد ✓" : "افزودن به سبد"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

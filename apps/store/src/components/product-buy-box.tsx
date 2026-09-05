"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditMark, Button, ProductGallery, cn } from "@kmodern/ui";
import { useCart } from "./cart-provider";
import { toFaDigits } from "@kmodern/schema";


/*
 * ProductBuyBox — the Zellerfeld floating buy-card anatomy, RTL-mirrored:
 * gallery on a plaster plinth, info column with credit mark leading, model
 * code in mono, price tabular, flame-blue CTA. Gallery and price react to
 * Color dots together. Add-to-cart behavior preserved from the VariantPicker.
 */
export function ProductBuyBox({
  variants,
  productName,
  model,
  description,
  specs,
}: {
  variants: Array<{
    id: string;
    colorName: string;
    colorCode: string | null;
    sku: string;
    price: number;
    images: string[];
    available: boolean;
  }>;
  productName: string;
  model?: string;
  description?: string | null;
  /** server-rendered specs/features block rendered under the buy controls */
  specs?: React.ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string>(variants[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const { add } = useCart();
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <ProductGallery images={selected?.images ?? []} alt={productName} />

      <div>
        <div className="flex items-start gap-3">
          <CreditMark />
          <div>
            {model && <div className="text-code text-xs text-ash">{model}</div>}
            <h1 className="mt-0.5 text-2xl font-black leading-snug text-ink">{productName}</h1>
          </div>
        </div>
        {description && <p className="mt-4 text-sm leading-7 text-ash">{description}</p>}

        {variants.length > 1 && (
          <div className="mt-6">
            <div className="mb-2 text-xs font-medium text-ash">رنگ: {selected?.colorName}</div>
            <div className="flex flex-row-reverse flex-wrap gap-2">
              {variants.map((v) => {
                const isActive = v.id === selected.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    aria-label={v.colorName}
                    title={v.colorName}
                    disabled={!v.available}
                    onClick={() => { setSelectedId(v.id); setQty(1); setAdded(false); }}
                    className={cn(
                      "size-7 rounded-[30px] border transition-all",
                      isActive
                        ? "border-2 border-flame-700 ring-2 ring-flame-100"
                        : "border-fog hover:border-slate-line",
                      !v.available && "cursor-not-allowed opacity-40",
                    )}
                    style={v.colorCode ? { backgroundColor: v.colorCode } : undefined}
                  />
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-8 flex items-baseline justify-between border-t border-plaster pt-6">
          {selected ? (
            <div className="text-price text-3xl text-ink">
              {toFaDigits(new Intl.NumberFormat("fa-IR").format(selected.price))}
            </div>
          ) : (
            <div className="text-ash">ناموجود</div>
          )}
          <span className="text-xs text-ash">تومان / هر واحد</span>
        </div>

        {selected?.available && (
          <div className="mt-6 flex items-center gap-3">
            <div className="flex items-center rounded-card border border-fog">
              <button className="px-3 py-2 text-ash hover:text-ink" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
              <span className="min-w-8 text-center text-sm font-semibold">{toFaDigits(qty)}</span>
              <button className="px-3 py-2 text-ash hover:text-ink" onClick={() => setQty(qty + 1)}>+</button>
            </div>
            <Button
              className={cn("flex-1", added && "bg-green-700 hover:bg-green-800")}
              onClick={() => {
                if (!selected) return;
                add(selected.id, qty);
                setAdded(true);
              }}
            >
              {added ? "به سبد اضافه شد ✓" : "افزودن به سبد خرید"}
            </Button>
          </div>
        )}
        {added && (
          <Link href="/cart" className="mt-3 block rounded-card border border-flame-200 bg-flame-50 py-2.5 text-center text-sm font-semibold text-flame-800 transition-colors hover:bg-flame-100">
            مشاهده سبد خرید
          </Link>
        )}
        {!selected?.available && (
          <div className="mt-6">
            <Button variant="ink" disabled className="w-full">ناموجود</Button>
            <p className="mt-2 text-xs text-ash">برای اطلاع از موجودی با ما تماس بگیرید.</p>
          </div>
        )}

        {specs}
      </div>
    </div>
  );
}

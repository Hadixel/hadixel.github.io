"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@heroui/react";
import { ProductGallery, cn } from "@kmodern/ui";
import { useCart } from "./cart-provider";
import { toFaDigits } from "@kmodern/schema";


/*
 * ProductBuyBox — the Zellerfeld floating buy-card anatomy, RTL-mirrored:
 * sticky gallery on a plaster plinth, info column with model code in mono,
 * Doran display title, price tabular, flame-blue CTA. Gallery and price
 * react to Color dots together. Add-to-cart behavior preserved from the
 * VariantPicker.
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
      <div className="self-start lg:sticky lg:top-24">
        <ProductGallery images={selected?.images ?? []} alt={productName} />
      </div>

      <div>
        <div>
          {model && <div className="text-code text-xs text-ash">{model}</div>}
          <h1 className="mt-0.5 font-display text-3xl font-extrabold leading-snug text-ink">{productName}</h1>
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

        <div className="mt-8 border-t border-plaster pt-6">
          {selected ? (
            <div className="text-price text-3xl text-ink">
              {toFaDigits(new Intl.NumberFormat("fa-IR").format(selected.price))}
              <span className="mr-2 text-sm font-normal text-ash">تومان</span>
            </div>
          ) : (
            <div className="text-ash">ناموجود</div>
          )}
        </div>

        {selected?.available && (
          <div className="mt-6 flex items-center gap-3">
            <div className="flex items-center rounded-card border border-fog">
              <Button isIconOnly variant="ghost" size="sm" onPress={() => setQty(Math.max(1, qty - 1))}>−</Button>
              <span className="min-w-8 text-center text-sm font-semibold">{toFaDigits(qty)}</span>
              <Button isIconOnly variant="ghost" size="sm" onPress={() => setQty(qty + 1)}>+</Button>
            </div>
            <Button
              className="flex-1"
              variant={added ? "secondary" : "primary"}
              isDisabled={added}
              onPress={() => {
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
            <Button variant="outline" isDisabled className="w-full">ناموجود</Button>
            <p className="mt-2 text-xs text-ash">برای اطلاع از موجودی با ما تماس بگیرید.</p>
          </div>
        )}

        {specs}
      </div>
    </div>
  );
}

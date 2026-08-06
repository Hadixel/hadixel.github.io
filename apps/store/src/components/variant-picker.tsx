"use client";

import { useState } from "react";
import Image from "next/image";
import { formatToman, toFaDigits } from "@kmodern/schema";
import { useCart } from "./cart-provider";

export interface VariantOption {
  id: string;
  colorName: string;
  colorCode: string | null;
  price: number;
  stock: number;
  reserved: number;
  allowBackorder: boolean;
  images: string[];
  sku: string;
  available: boolean;
}

export function VariantPicker({ variants, productName }: { variants: VariantOption[]; productName: string }) {
  const [selectedId, setSelectedId] = useState<string>(variants[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const { add } = useCart();

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  if (!selected) return <div className="text-gray-500">این محصول موجود نیست</div>;

  const stockLeft = selected.stock - selected.reserved;

  const handleAdd = () => {
    add(selected.id, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div>
      {/* color swatches */}
      <div className="flex flex-wrap gap-2">
        {variants.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => { setSelectedId(v.id); setQty(1); setAdded(false); }}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
              v.id === selected.id ? "border-amber-500 bg-amber-50 font-semibold text-amber-700" : "border-gray-200 hover:border-gray-400"
            } ${!v.available ? "opacity-40" : ""}`}
          >
            <span
              className="h-4 w-4 rounded-full border border-gray-300"
              style={{ backgroundColor: v.colorCode ?? "#ccc" }}
            />
            {v.colorName}
            {v.available && <span className="text-xs text-gray-400">{toFaDigits(v.price)}</span>}
          </button>
        ))}
      </div>

      {/* selected variant details */}
      <div className="mt-4 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">رنگ: {selected.colorName}</div>
            <div className="mt-1 text-xl font-bold">{formatToman(selected.price)}</div>
          </div>
          <div className="text-sm">
            {selected.allowBackorder ? (
              <span className="text-amber-600">پیشسفارش</span>
            ) : stockLeft > 0 ? (
              <span className="text-green-600">موجود ({toFaDigits(stockLeft)})</span>
            ) : (
              <span className="text-red-500">ناموجود</span>
            )}
          </div>
        </div>

        {selected.images.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {selected.images.map((src, i) => (
              <div key={i} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-50">
                <Image src={src} alt={`${productName} ${selected.colorName} ${i + 1}`} fill sizes="80px" className="object-contain" />
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center rounded-full border">
            <button type="button" className="px-3 py-2 hover:bg-gray-50" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
            <span className="min-w-8 text-center">{toFaDigits(qty)}</span>
            <button type="button" className="px-3 py-2 hover:bg-gray-50" onClick={() => setQty((q) => Math.min(99, q + 1))}>+</button>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!selected.available && !selected.allowBackorder}
            className={`flex-1 rounded-full px-6 py-3 font-semibold transition ${
              added ? "bg-green-600 text-white" : "bg-amber-500 text-slate-900 hover:bg-amber-400"
            } disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400`}
          >
            {added ? "به سبد اضافه شد ✓" : "افزودن به سبد خرید"}
          </button>
        </div>
      </div>
    </div>
  );
}
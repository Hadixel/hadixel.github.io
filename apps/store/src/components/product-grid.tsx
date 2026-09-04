"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { CreditMark, Price, ColorDotSwatches, cn } from "@kmodern/ui";
import type { DotVariant } from "@kmodern/ui";
import type { PublishedProduct } from "@/lib/queries";

/*
 * Product card — exact Zellerfeld standard-card anatomy: plaster surface,
 * no border, no shadow. Status badge top-left (12px offset). Centered
 * product image ~60% of card height. Metadata cluster anchored bottom:
 * credit mark → name → mono credit → price. Color dots swap imagery live.
 */
export function ProductCard({ product }: { product: PublishedProduct }) {
  const [selected, setSelected] = useState<DotVariant | null>(null);
  const activeImages = selected?.images?.length ? selected.images : product.dots[0]?.images ?? [];
  const imgA = activeImages[0] ?? product.image;
  const imgB = activeImages[1] ?? activeImages[0] ?? product.image;

  return (
    <Link href={`/product/${product.slug}`} className="group block rounded-card bg-plaster">
      <div className="relative aspect-square overflow-hidden rounded-card">
        {!product.available && (
          <span className="absolute left-3 top-3 z-10">
            <span className="inline-flex items-center rounded-[30px] bg-slate-line px-2 py-0.5 text-xs font-semibold text-white">
              ناموجود
            </span>
          </span>
        )}
        {imgA ? (
          <>
            <Image
              src={imgA}
              alt={product.name}
              fill
              sizes="(max-width:768px) 50vw, 25vw"
              className="object-contain p-4 mix-blend-multiply transition-opacity duration-300 group-hover:opacity-0"
            />
            {imgB && imgB !== imgA && (
              <Image
                src={imgB}
                alt=""
                fill
                sizes="(max-width:768px) 50vw, 25vw"
                className="object-contain p-4 mix-blend-multiply opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-line">بدون تصویر</div>
        )}
      </div>

      <div className="p-5 pt-4">
        <div className="flex items-start gap-2">
          <CreditMark />
          <div className="min-w-0">
            <div className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{product.name}</div>
            {product.model && <div className="text-code mt-1 text-xs text-ash">توسط دیتیس · {product.model}</div>}
          </div>
        </div>
        <div className="mt-2">
          <Price amount={selected?.price ?? product.price} maxAmount={selected ? undefined : product.maxPrice} className="text-sm" />
        </div>
        <ColorDotSwatches variants={product.dots} onSwap={(v) => setSelected(v)} className="mt-2" />
      </div>
    </Link>
  );
}

/* Grid wrapper — 4/2/1 collapse, 4px gap (tight reference rhythm). */
export function ProductGrid({ products, title }: { products: PublishedProduct[]; title?: string }) {
  if (products.length === 0) {
    return <div className="mx-auto max-w-[1440px] px-4 py-16 text-center text-ash">محصولی یافت نشد</div>;
  }
  return (
    <section className="mx-auto max-w-[1440px] px-4 py-10">
      {title && <h1 className="mb-8 text-3xl font-black text-ink">{title}</h1>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}

/* Ranked variant — giant translucent Persian numeral watermark INSIDE the
   plaster card (white/60 on plaster reads exactly like the reference). */
export function RankedProductCard({ product, rank }: { product: PublishedProduct; rank: number }) {
  const fa = (n: number) => new Intl.NumberFormat("fa-IR").format(n);
  return (
    <div className="relative">
      <ProductCard product={product} />
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-0 z-10 select-none text-[150px] font-black leading-none text-white/70"
      >
        {fa(rank)}
      </span>
    </div>
  );
}

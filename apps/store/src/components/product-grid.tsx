"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { CreditMark, Price, ColorDotSwatches } from "@kmodern/ui";
import type { DotVariant } from "@kmodern/ui";

/*
 * Product card — Zellerfeld plinth anatomy, RTL-mirrored: plaster surface
 * (separation by tone, no border, no shadow), centered product image,
 * metadata cluster anchored bottom-right with the دیتیس credit mark leading.
 * Color dots (CONTEXT.md): interactive swatches live-swap the card image
 * to the chosen variant — variation is shown, never counted. Hover
 * crossfades between the selected variant's first two images.
 */
export interface GridProduct {
  id: string;
  slug: string;
  name: string;
  brand: string;
  model: string;
  price: number;
  maxPrice: number;
  available: boolean;
  image: string | null;
  variantCount: number;
  dots: DotVariant[];
}

export function ProductGrid({ products, title }: { products: GridProduct[]; title?: string }) {
  if (products.length === 0) {
    return <div className="mx-auto max-w-7xl px-4 py-16 text-center text-ash">محصولی یافت نشد</div>;
  }
  return (
    <section className="mx-auto max-w-7xl px-4 py-10">
      {title && <h1 className="mb-8 text-3xl font-black text-ink">{title}</h1>}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}

export function ProductCard({ product }: { product: GridProduct }) {
  // selected variant drives the card image; default = first variant
  const [selected, setSelected] = useState<DotVariant | null>(null);
  const activeImages = selected?.images?.length ? selected.images : product.dots[0]?.images ?? [];
  const imgA = activeImages[0] ?? product.image;
  const imgB = activeImages[1] ?? activeImages[0] ?? product.image;

  return (
    <Link
      href={`/product/${product.slug}`}
      className="group block rounded-card bg-plaster p-5 transition-colors hover:bg-fog/60"
    >
      <div className="relative aspect-square overflow-hidden rounded-card">
        {!product.available && (
          <span className="absolute top-3 left-3 z-10 rounded-[30px] bg-slate-line px-2 py-0.5 text-xs font-semibold text-white">
            ناموجود
          </span>
        )}
        {imgA ? (
          <>
            {/* primary + crossfade layer: alternate image fades in on hover */}
            <Image
              src={imgA}
              alt={product.name}
              fill
              sizes="(max-width:768px) 50vw, 25vw"
              className="object-contain p-2 transition-opacity duration-300 group-hover:opacity-0"
            />
            {imgB && imgB !== imgA && (
              <Image
                src={imgB}
                alt=""
                fill
                sizes="(max-width:768px) 50vw, 25vw"
                className="object-contain p-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-line">بدون تصویر</div>
        )}
      </div>
      <div className="mt-4 flex items-start gap-2">
        <CreditMark />
        <div className="min-w-0">
          <div className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{product.name}</div>
          {product.model && <div className="text-code mt-1 text-xs text-ash">{product.model}</div>}
        </div>
      </div>
      <div className="mt-2 text-sm">
        <Price amount={selected?.price ?? product.price} maxAmount={selected ? undefined : product.maxPrice} />
      </div>
      <ColorDotSwatches
        variants={product.dots}
        onSwap={(v) => setSelected(v)}
        className="mt-3"
      />
    </Link>
  );
}

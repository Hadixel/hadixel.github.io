"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Badge } from "@heroui/react";

import { Price, ColorDotSwatches, cn } from "@kmodern/ui";
import type { DotVariant } from "@kmodern/ui";
import type { PublishedProduct } from "@/lib/queries";
import { AnimatedContent } from "./reactbits";

/*
 * Product card — exact Zellerfeld standard-card anatomy: plaster surface,
 * no border; soft elevation + hover lift per ADR-0002. Status badge
 * top-left (12px offset). Centered product image ~60% of card height.
 * Metadata cluster anchored bottom: credit mark → name → mono credit →
 * price. Color dots swap imagery live.
 */
export function ProductCard({ product }: { product: PublishedProduct }) {
  const [selected, setSelected] = useState<DotVariant | null>(null);
  const activeImages = selected?.images?.length ? selected.images : product.dots[0]?.images ?? [];
  const imgA = activeImages[0] ?? product.image;
  const imgB = activeImages[1] ?? activeImages[0] ?? product.image;
  const hasB = Boolean(imgB && imgB !== imgA);
  return (
    <Link
      href={`/product/${product.slug}`}
      className="group card-lift flex h-full flex-col rounded-card bg-plaster"
    >
      <div className="relative aspect-square overflow-hidden rounded-card bg-plaster">
        {/* white well — frames the photo, whites blend instead of pasting */}
        <div aria-hidden className="absolute inset-3 rounded-[10px] bg-canvas ring-1 ring-fog/40" />
        {!product.available && (
          <span className="absolute left-3 top-3 z-10">
            <Badge color="default" variant="primary">ناموجود</Badge>
          </span>
        )}
        {imgA ? (
          <>
            <Image
              src={imgA}
              alt={product.name}
              fill
              sizes="(max-width:768px) 50vw, 25vw"
              className={cn(
                "object-contain p-4 mix-blend-multiply transition duration-300",
                hasB ? "group-hover:opacity-0" : "group-hover:[transform:scale(1.04)]",
              )}
            />
            {hasB && (
              <Image
                src={imgB}
                alt=""
                fill
                sizes="(max-width:768px) 50vw, 25vw"
                className="[transform:scale(1.04)] object-contain p-4 opacity-0 mix-blend-multiply transition duration-300 group-hover:opacity-100"
              />
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-line">بدون تصویر</div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-5 pt-4">
        {/* reserved 2-line title — keeps every card the same height */}
        <div className="min-h-10">
          <div className="line-clamp-2 text-[15px] font-bold leading-snug text-ink">{product.name}</div>
        </div>
        <div className="min-h-5">
          {product.model && <div className="text-code mt-1 text-xs text-ash">{product.model}</div>}
        </div>
        <div className="mt-2">
          <Price amount={selected?.price ?? product.price} maxAmount={selected ? undefined : product.maxPrice} className="text-sm" />
        </div>
        <div className="mt-auto pt-2">
          <ColorDotSwatches variants={product.dots} onSwap={(v) => setSelected(v)} />
        </div>
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
      <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((p, i) => (
          <AnimatedContent key={p.id} delay={Math.min(i, 8) * 60} distance={26} className="h-full">
            <ProductCard product={p} />
          </AnimatedContent>
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

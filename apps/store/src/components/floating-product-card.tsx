"use client";

import Link from "next/link";
import Image from "next/image";
import { Price } from "@kmodern/ui";

/*
 * Floating product info card — exact Zellerfeld anatomy: white surface,
 * 16-20px padding, 60x60 thumbnail (10px radius), product name semibold,
 * price tabular, ink CTA. Floats over the hero
 * with soft surface elevation + hover lift (ADR-0002 depth doctrine).
 */
export function FloatingProductCard({
  href,
  name,
  image,
  price,
  maxPrice,
}: {
  href: string;
  name: string;
  image: string | null;
  price: number;
  maxPrice?: number;
}) {
  return (
    <div className="card-lift w-full max-w-[280px] rounded-card bg-canvas p-5">
      <div className="flex items-center gap-3">
        <div className="relative size-[60px] shrink-0 overflow-hidden rounded-card bg-plaster">
          {image && <Image src={image} alt={name} fill sizes="60px" className="object-contain p-1" />}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-ink">{name}</div>
          <div className="mt-1 text-sm">
            <Price amount={price} maxAmount={maxPrice} className="text-sm" />
          </div>
        </div>
      </div>
      <Link
        href={href}
        className="mt-4 block rounded-card bg-ink px-5 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-graphite"
      >
        مشاهده محصول
      </Link>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@heroui/react";
import { Price } from "@kmodern/ui";
import { cn } from "@kmodern/ui";
import type { DotVariant } from "@kmodern/ui";
import { ColorDotSwatches } from "@kmodern/ui";

/*
 * Showcase badge variants → HeroUI Badge props. Flame = solid accent pill,
 * pale = soft accent, slate = monochrome plaster pill (no invented chroma).
 */
const badgeProps = {
  flame: { color: "accent", variant: "primary" },
  pale: { color: "accent", variant: "soft" },
  slate: { color: "default", variant: "primary" },
} as const;
/*
 * Standard product card — exact Zellerfeld anatomy: plaster surface, no
 * border; soft elevation + hover lift per ADR-0002. Status badge top-LEFT
 * (12px offset; Zellerfeld's badge corner, kept left as the mirror of RTL
 * metadata anchoring right). Centered product image fills ~60% height.
 * Below: credit mark → name → mono credit → price. Color dots swap imagery
 * live (no navigation).
 */
export function ShowcaseCard({
  href,
  name,
  model,
  price,
  maxPrice,
  available,
  variants,
  badge,
  className,
}: {
  href: string;
  name: string;
  model?: string;
  price: number;
  maxPrice?: number;
  available: boolean;
  variants: DotVariant[];
  badge?: { label: string; variant: "flame" | "pale" | "slate" } | null;
  className?: string;
}) {
  const [selected, setSelected] = useState<DotVariant | null>(null);
  const activeImages = selected?.images?.length ? selected.images : variants[0]?.images ?? [];
  const imgA = activeImages[0];
  const imgB = activeImages[1] ?? activeImages[0];
  const hasB = Boolean(imgB && imgB !== imgA);

  return (
    <Link
      href={href}
      className={cn(
        "group card-lift block rounded-card bg-plaster",
        className,
      )}>
      <div className="relative aspect-square overflow-hidden rounded-card bg-plaster">
        {/* white well — frames the photo, whites blend instead of pasting */}
        <div aria-hidden className="absolute inset-3 rounded-[10px] bg-canvas ring-1 ring-fog/40" />
        {/* status badge — pill, 12px offset, identical anatomy across variants */}
        {badge && (
          <span className="absolute left-3 top-3 z-10">
            <Badge color={badgeProps[badge.variant].color} variant={badgeProps[badge.variant].variant}>
              {badge.label}
            </Badge>
          </span>
        )}
        {!available && !badge && (
          <span className="absolute left-3 top-3 z-10">
            <Badge color="default" variant="primary">ناموجود</Badge>
          </span>
        )}
        {imgA ? (
          <>
            <Image
              src={imgA}
              alt={name}
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
      <div className="p-5 pt-4">
        <div className="min-w-0">
          <div className="line-clamp-2 text-[15px] font-bold leading-snug text-ink">{name}</div>
          {model && <div className="text-code mt-1 text-xs text-ash">{model}</div>}
        </div>
        <div className="mt-2 flex items-end justify-between">
          <Price amount={selected?.price ?? price} maxAmount={selected ? undefined : maxPrice} className="text-sm" />
        </div>
        <ColorDotSwatches
          variants={variants}
          onSwap={(v) => setSelected(v)}
          className="mt-2"
        />
      </div>
    </Link>
  );
}

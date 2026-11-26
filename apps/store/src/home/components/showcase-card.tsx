"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@heroui/react";
import { formatToman } from "@kmodern/contracts/format";
import { Badge as FlameBadge, ColorDotSwatches, Price, cn } from "@kmodern/ui";
import type { DotVariant } from "@kmodern/ui";
import { ShimmerImage, AppliancePlaceholder } from "@/components/shimmer-image";

const badgeProps = {
  flame: { color: "accent", variant: "primary" },
  pale: { color: "accent", variant: "soft" },
  slate: { color: "default", variant: "primary" },
} as const;

export function ShowcaseCard({
  href,
  name,
  model,
  price,
  maxPrice,
  available,
  variants,
  badge,
  discount,
  className,
  priority = false,
  quality = 65,
  /* Safe upper bound, deliberately not tuned: the layouts that know their own
     mobile card width pass `imageSizes` explicitly. What falls through to this
     default includes `catalogue/components/product-grid.tsx:148`, whose
     `!mobileViews` branch is `grid-cols-1` — one full-width card per row on a
     phone. A tighter default would under-fetch there and blur the related
     products row, which is worse than the overfetch a rail would take. */
  imageSizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
}: {
  href: string;
  name: string;
  model?: string;
  price: number;
  maxPrice?: number;
  available: boolean;
  variants: DotVariant[];
  badge?: { label: string; variant: "flame" | "pale" | "slate" } | null;
  /** The gateway's price cut for this product, or none. `label` is already formatted (۲۰٪ or an
      amount) and `discountedPrice` is this card's lead price with the saving taken off. */
  discount?: { label: string; discountedPrice: number; endsAt: string | null } | null;
  className?: string;
  priority?: boolean;
  quality?: number;
  /* Grids that change the mobile card width (the two-up listing) pass their own
     `sizes` so the browser stops downloading a full-viewport image per card. */
  imageSizes?: string;
}) {
  const [isHovered, setIsHovered] = useState(false);

  const rawImages = variants[0]?.images ?? [];
  const imgA = rawImages[0];
  const imgB = rawImages[1] ?? rawImages[0];
  const hasB = Boolean(imgB && imgB !== imgA);
  /* One name for "this card is on sale": the plate wash and the price lead
     are the same decision, so they must not drift apart. */
  const onSale = available && Boolean(discount);
  const hasRange = Boolean(maxPrice && maxPrice !== price);
  const hasColorDots = new Set(variants.map((v) => v.colorName)).size > 1;
  const priceClassName = hasRange
    ? "text-xs font-semibold sm:text-sm lg:text-base"
    : "text-sm font-semibold sm:text-base lg:text-lg";

  return (
    <div
      onMouseEnter={() => {
        if (hasB && !isHovered) setIsHovered(true);
      }}
      className={cn(
        "group card-lift flex h-full flex-col rounded-card bg-plaster ring-1 ring-flame-100/70 transition-[box-shadow,ring-color,background-color] hover:bg-flame-50/35 hover:ring-flame-300 hover:shadow-md hover:shadow-flame-900/5",
        className,
      )}
    >
      <Link href={href} className="flex min-w-0 flex-1 flex-col" aria-label={`مشاهده ${name}`}>
        {/* The image stage is the card's proportion: 4:3 on a phone, the
            desktop square from `sm` up. A square stage on a 127px rail card
            left the text block a third of the card and the whole card read
            as a tall sliver next to the desktop card's wide stance. The
            `sm:` switch is what keeps the desktop card byte-identical. */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-transparent sm:aspect-square">
          {/* The plate behind the cut-out: canvas normally, a pale flame wash
              when the gateway's price cut is live. That is the card's one
              chromatic moment — value, not decoration (GLOSSARY.md). */}
          <div
            aria-hidden
            className={cn(
              "absolute inset-2 rounded-card ring-1 ring-fog/40 transition-colors group-hover:ring-flame-200 sm:inset-3",
              onSale ? "bg-flame-50" : "bg-canvas",
            )}
          />
          {/* The caller's own `badge`, then the discount pill (the gateway's `label`,
              already carrying its sign — ۲۰٪), then ناموجود while the product is
              unavailable. The pill lives on the picture, not in the price row.
              ناموجود still needs `!badge`. */}
          <span className="absolute left-2 top-2 z-10 flex flex-wrap items-center gap-1">
            {badge && (
              <Badge
                color={badgeProps[badge.variant].color}
                variant={badgeProps[badge.variant].variant}
              >
                {badge.label}
              </Badge>
            )}
            {onSale && discount && <FlameBadge variant="flame">{discount.label}</FlameBadge>}
            {!available && !badge && (
              <Badge color="default" variant="primary">
                ناموجود
              </Badge>
            )}
          </span>
          {imgA ? (
            <>
              <ShimmerImage
                key={imgA}
                src={imgA}
                alt={name}
                fill
                priority={priority}
                quality={quality}
                sizes={imageSizes}
                className={cn(
                  "object-contain p-2 mix-blend-multiply transition duration-300 sm:p-4",
                  hasB
                    ? "sm:group-hover:opacity-0"
                    : "group-hover:scale-[1.04] motion-reduce:transform-none",
                )}
              />
              {hasB && isHovered && (
                <Image
                  src={imgB}
                  alt=""
                  fill
                  sizes={imageSizes}
                  loading="lazy"
                  fetchPriority="low"
                  className="hidden sm:block scale-[1.04] object-contain p-2 opacity-0 mix-blend-multiply transition duration-300 sm:group-hover:opacity-100 sm:p-4"
                />
              )}
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <AppliancePlaceholder className="size-12 text-ash/40" />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-3 pb-2 sm:p-5 sm:pb-2.5">
          <div className="min-h-9 sm:min-h-11">
            <div className="line-clamp-2 text-sm font-bold leading-snug text-ink transition-colors group-hover:text-flame-800 sm:text-base">
              {name}
            </div>
          </div>
          {model && (
            <div className="text-code mt-0.5 text-xs text-ash sm:mt-1">
              {model}
            </div>
          )}
          {/* Price block: anchored to the bottom of the body with mt-auto so
              cards without color dots or with single-line prices don't leave
              empty plaster space at the bottom when aligned beside taller
              cards. */}
          <div className="mt-auto flex w-full min-w-0 max-w-full flex-wrap items-start gap-2 pt-1.5 sm:pt-2">
            {discount ? (
              <span className="flex min-w-0 max-w-full flex-col items-start">
                <s className="text-xs tabular-nums text-slate-line sm:text-sm">
                  {formatToman(price)}
                </s>
                <Price
                  amount={discount.discountedPrice}
                  tone="flame"
                  className={priceClassName}
                />
              </span>
            ) : (
              <Price
                amount={price}
                maxAmount={maxPrice}
                className={priceClassName}
              />
            )}
          </div>
        </div>
        <div
          className="flex min-h-7.5 items-center px-3 pb-3 pt-1 sm:min-h-9 sm:px-5 sm:pb-4"
          aria-hidden={!hasColorDots || undefined}
        >
          {hasColorDots ? <ColorDotSwatches variants={variants} /> : null}
        </div>
      </Link>
    </div>
  );
}

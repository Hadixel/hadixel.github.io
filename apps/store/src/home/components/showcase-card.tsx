"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@heroui/react";
import { formatToman } from "@kmodern/contracts/format";
import { Badge as FlameBadge, ColorDotSwatches, Price, cn } from "@kmodern/ui";
import type { DotVariant } from "@kmodern/ui";

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
  /* Safe upper bound, deliberately not tuned: the layouts that know their own
     mobile card width pass `imageSizes` explicitly. What falls through to this
     default includes `catalogue/components/product-grid.tsx:148`, whose
     `!mobileViews` branch is `grid-cols-1` — one full-width card per row on a
     phone. A tighter default would under-fetch there and blur the related
     products row, which is worse than the overfetch a rail would take. */
  imageSizes = "(max-width:640px) 100vw, (max-width:1024px) 50vw, 25vw",
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
  /* Grids that change the mobile card width (the two-up listing) pass their own
     `sizes` so the browser stops downloading a full-viewport image per card. */
  imageSizes?: string;
}) {
  const [selected, setSelected] = useState<DotVariant | null>(null);
  const activeImages = selected?.images?.length ? selected.images : (variants[0]?.images ?? []);
  const imgA = activeImages[0];
  const imgB = activeImages[1] ?? activeImages[0];
  const hasB = Boolean(imgB && imgB !== imgA);

  return (
    <div
      className={cn(
        "group card-lift flex h-full flex-col rounded-card bg-plaster ring-1 ring-transparent transition-[box-shadow,ring-color] hover:ring-fog",
        className,
      )}
    >
      <Link href={href} className="flex min-w-0 flex-1 flex-col" aria-label={`مشاهده ${name}`}>
        {/* The image stage is the card's proportion: 4:3 on a phone, the
            desktop square from `sm` up. A square stage on a 127px rail card
            left the text block a third of the card and the whole card read
            as a tall sliver next to the desktop card's wide stance. The
            `sm:` switch is what keeps the desktop card byte-identical. */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-plaster sm:aspect-square">
          <div
            aria-hidden
            className="absolute inset-2 rounded-card bg-canvas ring-1 ring-fog/40 sm:inset-3"
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
            {available && discount && <FlameBadge variant="flame">{discount.label}</FlameBadge>}
            {!available && !badge && (
              <Badge color="default" variant="primary">
                ناموجود
              </Badge>
            )}
          </span>
          {imgA ? (
            <>
              <Image
                src={imgA}
                alt={name}
                fill
                sizes={imageSizes}
                className={cn(
                  "object-contain p-2 mix-blend-multiply transition duration-300 sm:p-4",
                  hasB
                    ? "group-hover:opacity-0"
                    : "group-hover:scale-[1.04] motion-reduce:transform-none",
                )}
              />
              {hasB && (
                <Image
                  src={imgB}
                  alt=""
                  fill
                  sizes={imageSizes}
                  className="scale-[1.04] object-contain p-2 opacity-0 mix-blend-multiply transition duration-300 group-hover:opacity-100 sm:p-4"
                />
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-line">
              بدون تصویر
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-2.5 pb-1 sm:p-5 sm:pb-2">
          <div className="min-h-8 sm:min-h-10">
            <div className="line-clamp-2 text-[13px] font-bold leading-snug text-ink sm:text-[15px]">
              {name}
            </div>
          </div>
          <div className="min-h-5">
            {model && (
              <div className="text-code mt-0.5 text-[11px] text-ash sm:mt-1 sm:text-xs">
                {model}
              </div>
            )}
          </div>
          {/* Price rule: the discounted price leads only while the lead card's own price is on show
              (`no swatch selected`, or the selected swatch priced the same) — the gateway already
              took the saving off, so the original `price` is struck beside it. A differently priced
              variant shows that variant's price as it did before; the till still applies the
              discount at checkout even when the pill is hidden. */}
          {/* Price block: the struck original above, the discounted price below, so the
              pair never wraps apart inside a narrow rail card. The discount pill itself
              lives on the image (see above). */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:mt-2">
            {(!selected || selected.price === price) && discount ? (
              <span className="flex min-w-0 flex-col items-start">
                <s className="text-[11px] tabular-nums text-slate-line sm:text-xs">
                  {formatToman(price)}
                </s>
                <Price
                  amount={discount.discountedPrice}
                  tone="flame"
                  className="text-base sm:text-sm"
                />
              </span>
            ) : (
              <Price
                amount={selected?.price ?? price}
                maxAmount={selected ? undefined : maxPrice}
                className="text-base sm:text-sm"
              />
            )}
          </div>
        </div>
      </Link>
      {variants.length > 1 && (
        <div className="px-2.5 pb-2 pt-1 sm:px-5 sm:pb-4">
          <ColorDotSwatches variants={variants} onSwap={(variant) => setSelected(variant)} />
        </div>
      )}
    </div>
  );
}

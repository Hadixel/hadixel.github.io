"use client";

import Link from "next/link";
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

export function ShowcaseRowCard({
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
}: {
  href: string;
  name: string;
  model?: string;
  price: number;
  maxPrice?: number;
  available: boolean;
  variants: DotVariant[];
  badge?: { label: string; variant: "flame" | "pale" | "slate" } | null;
  discount?: { label: string; discountedPrice: number; endsAt: string | null } | null;
  className?: string;
  priority?: boolean;
  quality?: number;
}) {
  const rawImages = variants[0]?.images ?? [];
  const imgA = rawImages[0];
  const onSale = available && Boolean(discount);
  const hasRange = Boolean(maxPrice && maxPrice !== price);
  const priceClassName = hasRange
    ? "text-xs font-semibold sm:text-sm"
    : "text-sm font-semibold sm:text-base";

  return (
    <div
      className={cn(
        "group relative flex w-full min-w-0 items-stretch gap-3 border-b border-flame-100/80 bg-canvas py-3.5 transition-colors hover:bg-flame-50/35",
        className,
      )}
    >
      {/* Right side in RTL: Image + passive variant dots directly below */}
      <Link
        href={href}
        className="flex w-28 shrink-0 flex-col items-center sm:w-32"
        aria-label={`مشاهده ${name}`}
      >
        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-canvas p-1 ring-1 ring-flame-100/70 transition-colors group-hover:ring-flame-200">
          {badge && (
            <span className="absolute start-0 top-0 z-10">
              <Badge
                size="sm"
                color={badgeProps[badge.variant].color}
                variant={badgeProps[badge.variant].variant}
              >
                {badge.label}
              </Badge>
            </span>
          )}
          {onSale && discount && (
            <span className="absolute start-0 top-0 z-10">
              <FlameBadge variant="flame">{discount.label}</FlameBadge>
            </span>
          )}
          {imgA ? (
            <ShimmerImage
              key={imgA}
              src={imgA}
              alt={name}
              fill
              priority={priority}
              quality={quality}
              sizes="(max-width: 640px) 112px, 128px"
              className="object-contain mix-blend-multiply transition duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <AppliancePlaceholder className="size-8 text-ash/40" />
            </div>
          )}
        </div>

        {/* Variant color dots centered directly beneath the image */}
        {variants.length > 1 && (
          <div className="mt-1.5 flex items-center justify-center">
            <ColorDotSwatches variants={variants} className="gap-1" />
          </div>
        )}
      </Link>

      {/* Left side in RTL: Information */}
      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5 pe-1">
        <div>
          <Link href={href} className="block" aria-label={name}>
            <h3 className="line-clamp-2 text-sm font-bold leading-snug text-ink transition-colors group-hover:text-flame-700 sm:text-base">
              {name}
            </h3>
            {model && (
              <span className="text-code mt-0.5 block text-xs text-ash">
                {model}
              </span>
            )}
          </Link>

          {/* Availability / stock note */}
          <div className="mt-1.5">
            {!available ? (
              <span className="text-xs font-bold text-rose-600">به زودی</span>
            ) : (
              <span className="text-xs font-medium text-flame-800">موجود در انبار</span>
            )}
          </div>
        </div>

        {/* Bottom row: Rating on start (right in RTL), Price on end (left in RTL) */}
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="flex items-center gap-1 text-xs font-bold text-ash">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-amber-400"
              aria-hidden
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span>۴.۶</span>
          </div>

          <div className="flex flex-col items-end">
            {discount ? (
              <span className="flex flex-col items-end">
                <s className="text-xs sm:text-sm tabular-nums text-slate-line">
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
      </div>
    </div>
  );
}

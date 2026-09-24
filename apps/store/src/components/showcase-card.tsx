"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@heroui/react";
import { ColorDotSwatches, Price, cn } from "@kmodern/ui";
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
    <div className={cn("group card-lift flex h-full flex-col rounded-card bg-plaster", className)}>
      <Link href={href} className="flex min-w-0 flex-1 flex-col" aria-label={`مشاهده ${name}`}>
        <div className="relative aspect-square overflow-hidden rounded-card bg-plaster">
          <div aria-hidden className="absolute inset-3 rounded-card bg-canvas ring-1 ring-fog/40" />
          {badge && <span className="absolute left-3 top-3 z-10"><Badge color={badgeProps[badge.variant].color} variant={badgeProps[badge.variant].variant}>{badge.label}</Badge></span>}
          {!available && !badge && <span className="absolute left-3 top-3 z-10"><Badge color="default" variant="primary">ناموجود</Badge></span>}
          {imgA ? (
            <>
              <Image
                src={imgA}
                alt={name}
                fill
                sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 25vw"
                className={cn("object-contain p-4 mix-blend-multiply transition duration-300", hasB ? "group-hover:opacity-0" : "group-hover:scale-[1.04] motion-reduce:transform-none")}
              />
              {hasB && <Image src={imgB} alt="" fill sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 25vw" className="scale-[1.04] object-contain p-4 opacity-0 mix-blend-multiply transition duration-300 group-hover:opacity-100" />}
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-line">بدون تصویر</div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-5 pb-2">
          <div className="min-h-10"><div className="line-clamp-2 text-[15px] font-bold leading-snug text-ink">{name}</div></div>
          <div className="min-h-5">{model && <div className="text-code mt-1 text-xs text-ash">{model}</div>}</div>
          <div className="mt-2 flex items-end justify-between"><Price amount={selected?.price ?? price} maxAmount={selected ? undefined : maxPrice} className="text-sm" /></div>
        </div>
      </Link>
      {variants.length > 1 && <div className="px-5 pb-4 pt-1"><ColorDotSwatches variants={variants} onSwap={(variant) => setSelected(variant)} /></div>}
    </div>
  );
}

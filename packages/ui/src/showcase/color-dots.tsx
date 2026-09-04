"use client";

import { useState } from "react";
import Image from "next/image";

import { cn } from "../cn";
import { deriveColorDots, type DotVariant } from "./color-dots-logic";

/*
 * ColorDotSwatches — dots row only (no image box). Used on Product Cards,
 * where the card's main image is the swap target. One dot per Color;
 * disabled dots don't pretend to swap. Never renders a count
 * (CONTEXT.md "Color dots").
 */
export function ColorDotSwatches({
  variants,
  onSwap,
  className,
}: {
  variants: DotVariant[];
  onSwap?: (variant: DotVariant) => void;
  className?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const { dots, selected, swappable } = deriveColorDots(variants, selectedId);

  if (dots.length < 2 || !selected) return null;

  return (
    <div className={cn("flex flex-row-reverse items-center gap-1.5", className)}>
      {dots.map((dot) => {
        const canSwap = swappable.has(dot.id);
        const isActive = dot.id === selected.id;
        return (
          <button
            key={dot.id}
            type="button"
            aria-label={dot.colorName}
            onClick={(e) => {
              // dots live inside the card's <Link> — never navigate on swap
              e.preventDefault();
              e.stopPropagation();
              setSelectedId(dot.id);
              const v = variants.find((x) => x.id === dot.id);
              if (v && canSwap) onSwap?.(v);
            }}
            className={cn(
                isActive
                ? "border-2 border-flame-700 ring-2 ring-flame-100"
                : "border-fog hover:border-slate-line",
              !canSwap && "opacity-40",
            )}
            style={dot.colorCode ? { backgroundColor: dot.colorCode } : undefined}
          />
        );
      })}
    </div>
  );
}

/*
 * ColorDots — self-contained variant: swatches + an image box that swaps
 * with selection. Used where imagery isn't otherwise on screen.
 */
export function ColorDots({
  variants,
  imageSize = 96,
  className,
}: {
  variants: DotVariant[];
  imageSize?: number;
  className?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const { dots, selected, swappable } = deriveColorDots(variants, selectedId);

  if (dots.length === 0 || !selected) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative overflow-hidden rounded-card bg-canvas" style={{ height: imageSize }}>
        {selected.images[0] ? (
          <Image
            src={selected.images[0]}
            alt={selected.colorName}
            fill
            sizes={`${imageSize}px`}
            className="object-contain p-1"
          />
        ) : null}
      </div>
      <ColorDotSwatches
        variants={variants}
        onSwap={(v) => setSelectedId(v.id)}
        className={cn(swappable.size < 2 && "hidden")}
      />
    </div>
  );
}

"use client";

import { useState } from "react";

import { cn } from "../cn";
import { deriveColorDots, type DotVariant } from "./color-dots-logic";
import { ShimmerImage } from "../components/shimmer-image";

/*
 * ColorDotSwatches — dots row only (no image box). Used on Product Cards
 * to passively display available colors (or interactively when `onSwap` is
 * provided). One dot per Color; never renders a count (CONTEXT.md "Color dots").
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
  const { dots, selected } = deriveColorDots(variants, selectedId);

  if (dots.length < 2 || !selected) return null;

  if (!onSwap) {
    return (
      <div
        className={cn("inline-flex items-center gap-1.5", className)}
        aria-label="رنگ‌های موجود"
      >
        {dots.map((dot) => (
          <span
            key={dot.id}
            role="img"
            title={dot.colorName}
            aria-label={dot.colorName}
            className={cn(
              "size-3.5 shrink-0 rounded-full border-[1.5px] border-canvas ring-1 ring-ink/15 shadow-2xs sm:size-4",
              !dot.colorCode && "bg-plaster",
            )}
            style={dot.colorCode ? { backgroundColor: dot.colorCode } : undefined}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      {dots.map((dot) => {
        const isActive = dot.id === selected.id;
        return (
          <button
            key={dot.id}
            type="button"
            title={dot.colorName}
            aria-label={dot.colorName}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelectedId(dot.id);
              const v = variants.find((x) => x.id === dot.id);
              if (v) onSwap(v);
            }}
            className={cn(
              "size-4 shrink-0 rounded-full border-[1.5px] border-canvas transition-all sm:size-4.5 touch-manipulation cursor-pointer",
              !dot.colorCode && "bg-plaster",
              isActive
                ? "ring-2 ring-ink/60"
                : "ring-1 ring-ink/15 hover:ring-ink/40",
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
          <ShimmerImage
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

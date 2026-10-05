"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import { cn } from "../cn";

/*
 * SpotlightCard — cursor/finger-following radial glow over a card
 * (React Bits SpotlightCard adapted: dep-free, pointer events only — they fire
 * for touch too, so a finger drags the glow and the last tap leaves it lit).
 * The `--sxn/--syn` sample is written on the root so a child (the category
 * tile's photo layer) can parallax off the same pointer sample. No-JS or
 * no-pointer: the CSS defaults (`.5/.35`, and the `hover: none` static glow)
 * keep a visible centered glow — there is deliberately no JS fallback beyond
 * these handlers.
 */
export function SpotlightCard({
  children,
  className,
  color = "rgba(255,255,255,0.55)",
}: {
  children: ReactNode;
  className?: string;
  color?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const track = (event: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xn = (event.clientX - rect.left) / rect.width;
    const yn = (event.clientY - rect.top) / rect.height;
    el.style.setProperty("--sxn", xn.toFixed(3));
    el.style.setProperty("--syn", yn.toFixed(3));
    el.dataset.lit = "true";
  };

  return (
    <div
      ref={ref}
      className={cn("relative overflow-hidden", className)}
      onPointerDown={track}
      onPointerMove={track}
      onPointerLeave={(event) => {
        delete (event.currentTarget as HTMLElement).dataset.lit;
      }}
    >
      <span
        aria-hidden
        className="spotlight-overlay pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at calc(var(--sxn, .5) * 100%) calc(var(--syn, .35) * 100%), ${color}, transparent 70%)`,
        }}
      />
      {children}
    </div>
  );
}

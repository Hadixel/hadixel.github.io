"use client";

import type { ReactNode } from "react";
import { cn } from "../cn";

/*
 * StarBorder — a blue glow orbiting the content edge (React Bits StarBorder
 * adapted: two animated radial-gradient blobs, plain CSS — no pointer
 * involvement, so the motion actually reaches phones). `speed` rides the
 * inline `animation-duration`, overriding the stylesheet shorthand.
 */
export function StarBorder({
  children,
  className,
  color = "#3b82f6",
  speed = "6s",
}: {
  children: ReactNode;
  className?: string;
  color?: string;
  speed?: string;
}) {
  return (
    <div className={cn("relative inline-block overflow-hidden rounded-card", className)}>
      <span
        aria-hidden
        className="star-blob star-blob--bottom"
        style={{ background: `radial-gradient(circle, ${color}, transparent 10%)`, animationDuration: speed }}
      />
      <span
        aria-hidden
        className="star-blob star-blob--top"
        style={{ background: `radial-gradient(circle, ${color}, transparent 10%)`, animationDuration: speed }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

"use client";

import type { CSSProperties, ReactNode } from "react";

/* ReactBits-style primitives: CSS + standard web APIs.
   Content is server-rendered and permanently visible.
   All honor prefers-reduced-motion (no motion). */

/* ---------- AnimatedContent: entrance wrapper on scroll (safe: never hides content) ---------- */
export function AnimatedContent({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
  direction?: "vertical" | "horizontal";
  reverse?: boolean;
  duration?: number;
  style?: CSSProperties;
}) {
  return (
    <div className={`h-full ${className ?? ""}`} style={style} data-revealed="true">
      {children}
    </div>
  );
}

/* ---------- LogoLoop: seamless marquee (RTL-aware) ---------- */
export function LogoLoop({
  items,
  className,
  ariaLabel,
  speed = 60,
  reverse = false,
  gap = "gap-12",
}: {
  items: ReactNode[];
  className?: string;
  ariaLabel?: string;
  /** px per second */
  speed?: number;
  reverse?: boolean;
  /**
   * Tailwind gap class between items. It belongs to the caller because the
   * right gap tracks the item's rendered size: a text marquee reads fine at
   * 48px, but logo art at 24–36px tall needs roughly its own height between
   * marks or the strip reads as a scatter rather than a rail.
   */
  gap?: string;
}) {
  // No trailing padding on the group: the duplicated half is what makes the
  // -50% translate seamless, and any padding here widens only the gap at the
  // wrap point, which is the visible hiccup at the end of every cycle.
  const renderGroup = (hidden: boolean) => (
    <div className={`flex shrink-0 items-center ${gap}`} aria-hidden={hidden || undefined}>
      {items.map((it, i) => (
        <span key={i} className="flex shrink-0 items-center">
          {it}
        </span>
      ))}
    </div>
  );

  return (
    <div
      className={`logo-loop-viewport overflow-hidden ${className ?? ""}`}
      dir="ltr"
      tabIndex={0}
      aria-label={ariaLabel}
    >
      <div
        className="logo-loop-track flex w-max items-center will-change-transform"
        style={{
          animation: `logo-loop ${Math.max(20, (items.length * 220) / Math.max(20, speed))}s linear infinite`,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        {renderGroup(false)}
        {renderGroup(true)}
      </div>
      <style>{`
        @keyframes logo-loop { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) {
          .logo-loop-viewport { overflow-x: auto; }
          .logo-loop-track { animation: none !important; transform: none !important; }
          .logo-loop-track > [aria-hidden="true"] { display: none; }
        }
      `}</style>
    </div>
  );
}

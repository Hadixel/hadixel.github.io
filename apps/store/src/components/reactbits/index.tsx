"use client";

import { CSSProperties, ReactNode, useRef, useState, useEffect } from "react";

/* ReactBits-style primitives, dependency-free: CSS + IntersectionObserver.
   Content is server-rendered VISIBLE; animation applies only after mount to
   elements below the fold. All honor prefers-reduced-motion (no motion). */

/* Shared "entrance on scroll" observer: SSR renders the final state; on mount,
   elements below the fold start hidden and resolve once they intersect. The
   above-the-fold guard means content near the top never replays its entrance.
   Once revealed it stays revealed (observer disconnects). Two call sites
   (product-grid, deal-grid, block-renderer) need lockstep reveal behavior. */
function useEntrance<T extends HTMLElement>(threshold: number) {
  const ref = useRef<T>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.9) return; // above the fold: no animation
    setHidden(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setHidden(false);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return { ref, hidden };
}

/* ---------- AnimatedContent: entrance wrapper on scroll ---------- */
export function AnimatedContent({
  children,
  className,
  delay = 0,
  distance = 40,
  direction = "vertical",
  reverse = false,
  duration = 0.7,
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
  const { ref, hidden } = useEntrance<HTMLDivElement>(0.15);

  const offset = hidden
    ? `${direction === "vertical" ? `0, ${distance}px` : `${reverse ? distance : -distance}px, 0`}`
    : "0, 0";

  return (
    <div
      ref={ref}
      className={`h-full ${className ?? ""}`}
      data-revealed={!hidden || undefined}
      style={{
        ...style,
        opacity: hidden ? 0 : 1,
        transform: hidden ? `translate(${offset})` : "none",
        // A permanent transition keeps the element composited after the
        // entrance, which is what makes copy inside it hard to select on
        // touch devices. Only transition while the entrance is pending.
        transition: hidden
          ? `opacity ${duration}s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform ${duration}s cubic-bezier(0.16,1,0.3,1) ${delay}ms`
          : undefined,
      }}
    >
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

"use client";

import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from "react";

/* ReactBits-style primitives, dependency-free: CSS + IntersectionObserver.
   Content is server-rendered VISIBLE; animation applies only after mount to
   elements below the fold. All honor prefers-reduced-motion (no motion). */

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- BlurText: words resolve from blur, staggered ---------- */
export function BlurText({
  text,
  className,
  delay = 60,
  direction = "top",
}: {
  text: string;
  className?: string;
  delay?: number;
  direction?: "top" | "bottom";
}) {
  const words = useMemo(() => text.split(" "), [text]);
  const ref = useRef<HTMLSpanElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
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
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <span ref={ref} className={className} aria-label={text} role="text">
      {words.map((w, i) => (
        <span
          key={`${w}-${i}`}
          aria-hidden
          className="inline-block"
          style={{
            filter: hidden ? "blur(10px)" : "blur(0)",
            opacity: hidden ? 0 : 1,
            transform: hidden ? `translateY(${direction === "top" ? "10px" : "-10px"})` : "none",
            transition: `filter 0.5s cubic-bezier(0.16,1,0.3,1) ${i * delay}ms, opacity 0.5s cubic-bezier(0.16,1,0.3,1) ${i * delay}ms, transform 0.5s cubic-bezier(0.16,1,0.3,1) ${i * delay}ms`,
          }}
        >
          {w}
          {i < words.length - 1 ? "\u00A0" : ""}
        </span>
      ))}
    </span>
  );
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
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.9) return;
    setHidden(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setHidden(false);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const offset = hidden
    ? `${direction === "vertical" ? `0, ${distance}px` : `${reverse ? distance : -distance}px, 0`}`
    : "0, 0";

  return (
    <div
      ref={ref}
      className={`h-full ${className ?? ""}`}
      style={{
        ...style,
        opacity: hidden ? 0 : 1,
        transform: hidden ? `translate(${offset})` : "none",
        transition: `opacity ${duration}s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform ${duration}s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
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
}: {
  items: ReactNode[];
  className?: string;
  ariaLabel?: string;
  /** px per second */
  speed?: number;
  reverse?: boolean;
}) {
  // No trailing padding on the group: the duplicated half is what makes the
  // -50% translate seamless, and any padding here widens only the gap at the
  // wrap point, which is the visible hiccup at the end of every cycle.
  const renderGroup = (hidden: boolean) => (
    <div className="flex shrink-0 items-center gap-12" aria-hidden={hidden || undefined}>
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

/* ---------- GlareHover: light sweep on hover (pure CSS) ---------- */
export function GlareHover({
  children,
  className,
  glareColor = "rgba(255,255,255,0.55)",
  width = "100%",
  height = "100%",
  borderRadius = "10px",
}: {
  children: ReactNode;
  className?: string;
  glareColor?: string;
  width?: string;
  height?: string;
  borderRadius?: string;
}) {
  return (
    <div className={`gh relative overflow-hidden ${className ?? ""}`} style={{ width, height, borderRadius }}>
      {children}
      <span
        aria-hidden
        className="gh__glare pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(105deg, transparent 40%, ${glareColor} 50%, transparent 60%)`,
          transform: "translateX(-120%)",
        }}
      />
      <style>{`
        .gh:hover .gh__glare { animation: gh-sweep 0.9s cubic-bezier(0.16,1,0.3,1) forwards; }
        @keyframes gh-sweep { to { transform: translateX(120%); } }
        @media (prefers-reduced-motion: reduce) { .gh:hover .gh__glare { animation: none; opacity: 0; } }
      `}</style>
    </div>
  );
}


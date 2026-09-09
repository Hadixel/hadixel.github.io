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

/* ---------- CountUp: rAF count-up on visibility ---------- */
export function CountUp({
  to,
  from = 0,
  duration = 1.4,
  separator = "fa-IR",
  suffix,
  className,
}: {
  to: number;
  from?: number;
  duration?: number;
  separator?: string | false;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(to); // SSR shows the final value

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / (duration * 1000));
          const eased = 1 - Math.pow(1 - p, 3);
          setVal(Math.round(from + (to - from) * eased));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        setVal(from);
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      setVal(to);
    };
  }, [to, from, duration]);

  const shown = separator ? new Intl.NumberFormat(separator).format(val) : String(val);
  return (
    <span ref={ref} className={className}>
      {shown}
      {suffix}
    </span>
  );
}

/* ---------- LogoLoop: seamless marquee (RTL-aware) ---------- */
export function LogoLoop({
  items,
  className,
  speed = 60,
  reverse = false,
}: {
  items: ReactNode[];
  className?: string;
  /** px per second */
  speed?: number;
  reverse?: boolean;
}) {
  const doubled = [...items, ...items];
  return (
    <div className={`overflow-hidden ${className ?? ""}`} dir="ltr">
      <div
        className="flex w-max items-center gap-12 will-change-transform motion-reduce:!animate-none"
        style={{
          animation: `logo-loop ${Math.max(20, (items.length * 220) / Math.max(20, speed))}s linear infinite`,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        {doubled.map((it, i) => (
          <span key={i} className="flex shrink-0 items-center" aria-hidden={i >= items.length}>
            {it}
          </span>
        ))}
      </div>
      <style>{`@keyframes logo-loop { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
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

/* ---------- Magnet: element eases toward the cursor ---------- */
export function Magnet({
  children,
  className,
  padding = 60,
  magnetStrength = 4,
}: {
  children: ReactNode;
  className?: string;
  padding?: number;
  magnetStrength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState("translate(0px, 0px)");
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (reduced()) return;
    const el = ref.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = Math.abs(cx - e.clientX);
      const dy = Math.abs(cy - e.clientY);
      if (dx < r.width / 2 + padding && dy < r.height / 2 + padding) {
        setActive(true);
        setOffset(`translate(${(e.clientX - cx) / magnetStrength}px, ${(e.clientY - cy) / magnetStrength}px)`);
      } else if (active) {
        setActive(false);
        setOffset("translate(0px, 0px)");
      }
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [padding, magnetStrength, active]);

  return (
    <div
      ref={ref}
      className={`will-change-transform ${className ?? ""}`}
      style={{ transform: offset, transition: "transform 0.3s cubic-bezier(0.16,1,0.3,1)" }}
    >
      {children}
    </div>
  );
}

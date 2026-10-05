"use client";

import { useEffect, useRef, useState } from "react";
import { toFaDigits } from "@kmodern/contracts";
import { cn } from "../cn";
import { useInView } from "./use-in-view";

/*
 * Counter — animated numeric counter rendered in Persian digits with
 * tabular alignment. The NUMBER animates; digits stay Persian throughout.
 */
export function Counter({
  to,
  durationMs = 1200,
  className,
}: {
  to: number;
  durationMs?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (!inView || started.current) return;
    started.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(to);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(eased * to));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, durationMs]);

  return (
    <span ref={ref} className={cn("text-price tabular-nums", className)}>
      {toFaDigits(new Intl.NumberFormat("fa-IR").format(value))}
    </span>
  );
}

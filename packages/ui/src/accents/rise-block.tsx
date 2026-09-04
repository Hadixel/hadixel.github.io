"use client";

import { cn } from "../cn";
import { useInView } from "./use-in-view";

/*
 * RiseBlock — whole-block rise+fade. Safest effect: no text splitting at all.
 * Use for cards, banners, image blocks.
 */
export function RiseBlock({
  children,
  className,
  delayMs = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn(
        "transition-[opacity,translate] duration-700 ease-out will-change-[opacity,translate]",
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
        className,
      )}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}

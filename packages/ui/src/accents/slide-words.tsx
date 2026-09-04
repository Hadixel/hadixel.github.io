"use client";

import { cn } from "../cn";
import { useInView } from "./use-in-view";

/*
 * SlideWords — words slide in from the right (RTL-native direction) with
 * a clip feel. Word-level; Persian joins intact.
 */
export function SlideWords({
  text,
  className,
  staggerMs = 110,
}: {
  text: string;
  className?: string;
  staggerMs?: number;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const words = text.split(" ");
  return (
    <span ref={ref} className={cn("inline-block", className)} aria-label={text}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} aria-hidden className="inline-block overflow-hidden align-bottom">
          <span
            className={cn(
              "inline-block transition-transform duration-500 ease-out will-change-transform",
              inView ? "translate-x-0" : "translate-x-full",
            )}
            style={{ transitionDelay: `${i * staggerMs}ms` }}
          >
            {word}
            {i < words.length - 1 ? " " : ""}
          </span>
        </span>
      ))}
    </span>
  );
}

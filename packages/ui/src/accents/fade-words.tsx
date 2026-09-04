"use client";

import { cn } from "../cn";
import { useInView } from "./use-in-view";

/*
 * FadeWords — word-level fade/rise reveal (React Bits "Split Text" adapted:
 * split at SPACES so Persian letter-joining survives). SSR renders the
 * final sentence; animation plays once on first intersection.
 */
export function FadeWords({
  text,
  className,
  wordClassName,
  staggerMs = 90,
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  staggerMs?: number;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const words = text.split(" ");
  return (
    <span ref={ref} className={cn("inline-block", className)} aria-label={text}>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          aria-hidden
          className={cn(
            "inline-block transition-[opacity,translate] duration-500 ease-out will-change-[opacity,translate]",
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
            wordClassName,
          )}
          style={{ transitionDelay: `${i * staggerMs}ms` }}
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

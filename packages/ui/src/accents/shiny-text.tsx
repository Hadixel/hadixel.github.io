"use client";

import { cn } from "../cn";

/*
 * ShinyText — metallic sheen sweeping across text (React Bits "Shiny Text"
 * adapted). Pure CSS: a background-clip:text gradient translate loop. The
 * text never splits, so Persian letter-joining is untouched; the sheen is
 * decorative, so the reduced-motion fallback is simply the static text in
 * its base color (the animation element is aria-hidden and duplicating
 * nothing — this component is one node, unlike the word-splitters).
 */
export function ShinyText({
  text,
  className,
  /** Seconds for one sweep. */
  speed = 2.4,
  /** Base text color (any CSS color). */
  color = "#6b7280",
  /** Highlight color of the sweep. */
  shineColor = "#ffffff",
  /** Gradient angle in deg; ~120° sweeps left-to-right. */
  spread = 120,
}: {
  text: string;
  className?: string;
  speed?: number;
  color?: string;
  shineColor?: string;
  spread?: number;
}) {
  return (
    <span
      aria-label={text}
      className={cn("shiny-text inline-block", className)}
      style={
        {
          "--shiny-duration": `${speed}s`,
          "--shiny-color": color,
          "--shiny-shine": shineColor,
          "--shiny-spread": `${spread}deg`,
        } as React.CSSProperties
      }
    >
      {text}
    </span>
  );
}

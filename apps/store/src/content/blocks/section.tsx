import type { ReactNode } from "react";

/**
 * The band a content block sits in.
 *
 * This was a function inside the one file that drew every block type. It is here instead because
 * most of them wrap their content in it, and a helper that more than two of them use is a shared
 * unit rather than one block's private detail.
 */

export function Section({
  children,
  padding = "md",
  className,
  id,
}: {
  children: ReactNode;
  padding?: "sm" | "md" | "lg" | string;
  className?: string;
  id?: string;
}) {
  const pad = padding === "none" ? "" : padding === "sm" ? "py-7 sm:py-8 md:py-10" : padding === "lg" ? "py-12 md:py-24" : "py-7 sm:py-10 md:py-16";
  const classes = `mx-auto max-w-[1440px] px-4 ${pad} ${className ?? ""}`;
  return (
    <section id={id} className={classes}>
      {children}
    </section>
  );
}

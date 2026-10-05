import type { ReactNode } from "react";
import type { ComponentProps } from "@kmodern/contracts";
import { AnimatedContent } from "@/components/reactbits/index";
import type { BlockRendererProps } from "./types";

/* ---------- Trust badges: icon + Persian label strip on plaster ---------- */
export function TrustBadgesBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["trustBadges"];
  const icons: Record<string, ReactNode> = {
    truck: <path d="M13 16V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10h2m8 0h4m-4 0h-4m9 0h2v-4l-3-4h-3m1 8a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M6 16.5a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0" />,
    shield: <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />,
    "credit-card": <><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M2.5 10h19M6 15h4" /></>,
    headset: <path d="M4 13a8 8 0 0 1 16 0m-16 0v3a2 2 0 0 0 2 2h1v-5H5a2 2 0 0 0-1 1zm16 0v3a2 2 0 0 1-2 2h-1v-5h2a2 2 0 0 1 1 1z" />,
  };
  return (
    <div className="w-full border-y border-plaster bg-canvas">
      {/* Static grid at every width — two columns on a phone, four from `md`.
          It briefly wore `.section-rail`, whose flex row below `sm` overrode
          the grid and stranded the four badges in a scrollable strip; a trust
          strip is not a content rail, so nothing here should scroll. */}
      <div className="mx-auto grid max-w-[1440px] grid-cols-2 justify-items-center gap-x-4 gap-y-5 px-4 py-6 md:grid-cols-4 md:gap-6 md:py-10">
        {p.items.map((it, i) => (
          <AnimatedContent key={i} delay={i * 90} distance={20}>
            <div className="flex items-center justify-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-plaster text-ink md:size-10">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {icons[it.icon ?? ""] ?? icons.shield}
                </svg>
              </span>
              <span className="text-center text-xs font-bold leading-snug text-ink md:text-sm">{it.label}</span>
            </div>
          </AnimatedContent>
        ))}
      </div>
    </div>
  );
}

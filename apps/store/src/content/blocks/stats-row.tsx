import type { ComponentProps } from "@kmodern/contracts";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";

export function StatsRowBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["statsRow"];
  return (
    <Section id={p.anchorId}>
      {/* Rail on phones (see `.section-rail`). The hairline grid separator is
          desktop-only: as a rail each plate needs its own edge, so the fog
          backing and the 1px gap come back from sm up. */}
      <div className="section-rail grid gap-px sm:grid-cols-2 sm:overflow-hidden sm:rounded-card sm:bg-fog/70 lg:grid-cols-4">
        {p.items.map((item, index) => (
          <div key={`${item.value}-${item.label}-${index}`} className="section-rail-item rounded-card bg-plaster/70 p-6 text-center sm:rounded-none">
            <div className="font-display text-3xl font-black tabular-nums text-ink">{item.value}</div>
            <div className="mt-2 text-sm text-ash">{item.label}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

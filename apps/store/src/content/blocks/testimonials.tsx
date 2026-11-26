import type { ComponentProps } from "@kmodern/contracts";
import { SectionHeader } from "@kmodern/ui";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";

export function TestimonialsBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["testimonials"];
  return (
    <Section>
      {p.title && <SectionHeader title={p.title} />}
      {/* Snap rail on phones (the bestsellers pattern), grid from sm up: a
          stacked list of three quotes made the page twice as tall for the
          same three cards. overflow-y is strictly locked to prevent vertical scroll. */}
      <div className="section-rail -mx-4 flex items-stretch px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:px-0 md:grid-cols-3">
        {p.items.map((t, i) => (
          <div key={i} className="section-rail-item section-rail-item-wide">
            <div className="h-full rounded-card border border-plaster/80 bg-canvas p-4 shadow-2xs sm:p-6">
              <p className="text-[13px] leading-6 text-ink sm:text-sm sm:leading-7">«{t.quote}»</p>
              <div className="mt-3 text-xs font-semibold text-ash sm:mt-4">
                {t.author}
                {t.role ? ` · ${t.role}` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

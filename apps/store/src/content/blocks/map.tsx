import type { ComponentProps } from "@kmodern/contracts";
import { SectionHeader } from "@kmodern/ui";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";

export function MapBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["map"];
  return (
    <Section id={p.anchorId}>
      {p.title && <SectionHeader title={p.title} />}
      <div className="mx-auto aspect-[16/7] max-w-5xl overflow-hidden rounded-card bg-plaster">
        <iframe src={p.embedUrl} title={p.title ?? "نقشه"} loading="lazy" className="h-full w-full" />
      </div>
    </Section>
  );
}

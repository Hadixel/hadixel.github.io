import type { ComponentProps } from "@kmodern/contracts";
import { DealGrid } from "@/home/components/deal-grid";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";

export function DealGridBlock({ block, payload }: BlockRendererProps) {
  const p = block.props as ComponentProps["dealGrid"];
  const deals = payload.deals ?? [];
  return (
    <Section>
      <DealGrid deals={deals} title={p.title} emptyText={p.emptyText} />
    </Section>
  );
}

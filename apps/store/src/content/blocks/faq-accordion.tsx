import type { ComponentProps } from "@kmodern/contracts";
import { SectionHeader } from "@kmodern/ui";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";

export function FaqAccordionBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["faqAccordion"];
  return (
    <Section>
      {p.title && <SectionHeader title={p.title} />}
      <div className="mx-auto max-w-3xl divide-y divide-plaster border-y border-plaster">
        {p.items.map((it, i) => (
          <details key={i} className="group py-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-ink marker:hidden">{it.question}</summary>
            <p className="mt-2 text-sm leading-7 text-ash">{it.answer}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

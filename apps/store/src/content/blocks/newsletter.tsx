import type { ComponentProps } from "@kmodern/contracts";
import { SectionHeader } from "@kmodern/ui";
import { NewsletterForm } from "@/content/components/newsletter-form";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";

export function NewsletterBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["newsletter"];
  return (
    <Section>
      {p.title && <SectionHeader title={p.title} description={p.subtitle} />}
      <NewsletterForm />
    </Section>
  );
}

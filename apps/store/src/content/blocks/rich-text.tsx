import type { ComponentProps } from "@kmodern/contracts";
import { sanitizeAdminHtml } from "@kmodern/contracts/sanitize";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";

export function RichTextBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["richText"];
  return (
    <Section>
      <div className="mx-auto max-w-3xl leading-9 text-ink [&_a]:text-flame-700 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-black [&_p]:mb-4" dangerouslySetInnerHTML={{ __html: sanitizeAdminHtml(p.html) }} />
    </Section>
  );
}

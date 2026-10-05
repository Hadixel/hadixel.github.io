import type { ComponentProps } from "@kmodern/contracts";
import { sanitizeAdminHtml } from "@kmodern/contracts/sanitize";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";

export function CustomHtmlBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["customHtml"];
  return <Section id={p.anchorId}><div className="mx-auto max-w-3xl leading-8 text-ink" dangerouslySetInnerHTML={{ __html: sanitizeAdminHtml(p.html) }} /></Section>;
}

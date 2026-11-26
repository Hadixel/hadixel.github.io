import type { ComponentProps } from "@kmodern/contracts";
import { CountdownTimer } from "@/home/components/countdown-timer";
import { hrefFor } from "@/lib/nav";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";

export async function CountdownBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["countdown"];
  const link = block.data?.link?.href
    ? { href: block.data.link.href, newTab: Boolean(block.data.link.newTab) }
    : p.link
      ? await hrefFor(p.link)
      : null;
  return (
    <Section>
      <CountdownTimer endsAt={p.endsAt} linkHref={link?.href} />
    </Section>
  );
}

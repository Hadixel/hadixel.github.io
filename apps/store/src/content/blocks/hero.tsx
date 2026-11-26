import type { ComponentProps } from "@kmodern/contracts";
import { HomeHero } from "@/home/components/home-hero";
import { hrefFor } from "@/lib/nav";
import type { BlockRendererProps } from "./types";

/* ---------- Hero: the appliance on the gallery wall. The panel is a plaster
   alcove with the block's object standing in it; the copy sits beside it as a
   wall label. The object is the block's own image, so the content team owns
   which appliance is on the wall. ---------- */
export async function HeroBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["hero"];
  const cta = block.data?.cta?.href
    ? { href: block.data.cta.href, newTab: Boolean(block.data.cta.newTab) }
    : p.cta
      ? await hrefFor(p.cta.link)
      : null;
  return (
    <HomeHero
      title={p.title}
      subtitle={p.subtitle}
      cta={cta ? { href: cta.href, label: p.cta!.label, newTab: cta.newTab } : null}
      image={p.image ? { src: p.image.src, alt: p.image.alt } : null}
    />
  );
}

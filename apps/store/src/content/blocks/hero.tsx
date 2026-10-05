import type { ComponentProps } from "@kmodern/contracts";
import { HomeHero } from "@/home/components/home-hero";
import { hrefFor } from "@/lib/nav";
import type { BlockRendererProps } from "./types";

/* ---------- Hero: Burner Ignition. Type and authored geometry only — the
   panel carries the headline, the ember rings and the CTAs, and no
   raster imagery at all. The existing storefront header remains outside
   this composition. ---------- */
export async function HeroBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["hero"];
  const cta = p.cta ? await hrefFor(p.cta.link) : null;
  return (
    <HomeHero
      title={p.title}
      subtitle={p.subtitle}
      cta={cta ? { href: cta.href, label: p.cta!.label, newTab: cta.newTab } : null}
    />
  );
}

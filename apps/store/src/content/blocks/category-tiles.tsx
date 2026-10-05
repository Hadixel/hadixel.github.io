import Image from "next/image";
import Link from "next/link";
import type { ComponentProps } from "@kmodern/contracts";
import { SectionHeader, SpotlightCard } from "@kmodern/ui";
import { AnimatedContent } from "@/components/reactbits/index";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";

export function CategoryTilesBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["categoryTiles"];
  // The gateway resolved these, one per entry in `p.categories` and in the same order, so the
  // image from props and the name and href from data line up by index. This used to look each
  // category up itself — the same category resolved twice, in two processes, which is how a
  // renamed category ends up showing its old name here and its new one on the category page.
  const tiles = p.categories.map(
    (entry, index) => ({ ...(block.data.tiles?.[index] ?? { href: "/", name: "دسته" }), image: entry.image }),
  );
  return (
    <Section>
      {/* An index, not a wall of cards: centred heading, no filled surfaces,
          the name carries the weight. A blue "all products" chip here read
          like the page you were already on. */}
      {p.title && <SectionHeader title={p.title} description={p.subtitle} />}
      {/* Rail on phones (see `.section-rail`), five columns from sm up. */}
      <div className="section-rail -mx-4 grid grid-cols-2 gap-3 px-4 sm:mx-0 sm:grid-cols-3 sm:gap-4 sm:px-0 lg:grid-cols-5">
        {tiles.map((t, i) => (
          <AnimatedContent key={t.href} delay={i * 70} distance={24} className="section-rail-item section-rail-item-tile h-full">
            {/* A card the photograph sits on, rather than a photo floating on
                the page: canvas surface, hairline edge, and the name carried
                inside so the tile reads as one object at any width.

                The hover lift and shadow sit on this wrapper, not on the Link:
                SpotlightCard clips its children (`overflow-hidden` keeps the
                glow and the photo inside the card), so a lift on the Link lost
                its top 4px and its entire shadow to the crop. The wrapper is
                also the only element here that can be raised in stacking
                order — the Link is `static`, so a lifted card slid under the
                row above instead of over it. */}
            <SpotlightCard className="h-full rounded-card transition-all duration-300 hover:-translate-y-1 hover:z-10 hover:shadow-[0_18px_40px_-24px_rgba(17,17,17,0.35)] motion-reduce:transform-none">
              <Link
                href={t.href}
                className="group flex h-full flex-col overflow-hidden rounded-card border border-plaster bg-canvas transition-colors duration-300 hover:border-slate-line active:scale-[0.98] motion-reduce:active:scale-100"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-plaster sm:aspect-square">
                  {t.image && (
                    /* Contain, not cover: these tiles are pointed at catalog
                       cut-outs on a white field, not editorial photographs.
                       A cover frame slices a quarter off every appliance
                       (a square 298px cut-out into a 299x224 box). Contain +
                       multiply on plaster is the same stage the product
                       cards use, so one product reads identically in both.
                       4:3 below `sm` keeps the phone tile from towering over
                       its one-word label; the square returns from `sm`. */
                    <Image
                      src={t.image}
                      alt=""
                      fill
                      sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 20vw"
                      className="object-contain p-1.5 mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transform-none sm:p-4"
                    />
                  )}
                </div>
                <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-2 py-2 text-center sm:gap-2 sm:px-3 sm:py-4">
                  <h3 className="font-display text-sm font-extrabold text-ink sm:text-xl">{t.name}</h3>
                  <span
                    aria-hidden
                    className="block h-px w-7 bg-slate-line transition-all duration-300 group-hover:w-12 group-hover:bg-flame-700 motion-reduce:transition-none"
                  />
                </div>
                <span className="sr-only">{`مشاهده محصولات ${t.name}`}</span>
              </Link>
            </SpotlightCard>
          </AnimatedContent>
        ))}
      </div>
    </Section>
  );
}

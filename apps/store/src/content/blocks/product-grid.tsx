import type { ComponentProps } from "@kmodern/contracts";
import { RankNumeral, SectionHeader } from "@kmodern/ui";
import { ShowcaseCard } from "@/home/components/showcase-card";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";

/* ---------- Ranked editorial row: giant translucent Persian numeral
   watermark top-right of each plaster card, product centered. ---------- */
export function ProductGridBlock({ block, payload }: BlockRendererProps) {
  const p = block.props as ComponentProps["productGrid"];
  const products = payload.products ?? [];
  return (
    <Section>
      {p.title && <SectionHeader title={p.title} seeAllHref="/products" />}
      <div className="section-rail -mx-4 flex items-stretch px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:px-0 lg:grid-cols-4">
        {products.map((pr, i) => (
          <div key={pr.id} className="section-rail-item relative h-full">
            <RankNumeral rank={i + 1} />
            <ShowcaseCard
              href={`/product/${pr.slug}`}
              name={pr.name}
              model={pr.model}
              price={pr.price}
              maxPrice={pr.maxPrice}
              available={pr.available}
              variants={pr.dots}
              discount={pr.discount}
              /* The rail card is ~38% of the viewport on a phone, so the
                 two-up default would still fetch full-width art per card. */
              imageSizes="(max-width:640px) 40vw, (max-width:1024px) 50vw, 25vw"
            />
          </div>
        ))}
      </div>
    </Section>
  );
}

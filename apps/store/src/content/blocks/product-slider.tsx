import type { ComponentProps } from "@kmodern/contracts";
import { SectionHeader } from "@kmodern/ui";
import { ShowcaseCard } from "@/home/components/showcase-card";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";

export function ProductSliderBlock({ block, payload }: BlockRendererProps) {
  const p = block.props as ComponentProps["productSlider"];
  const products = payload.products ?? [];
  return (
    <Section>
      {p.title && <SectionHeader title={p.title} seeAllHref="/products" />}
      <div className="section-rail -mx-4 px-4 sm:gap-4">
        {products.slice(0, p.limit ?? 8).map((pr) => (
          <div key={pr.id} className="section-rail-item sm:w-72">
            <ShowcaseCard
              href={`/product/${pr.slug}`}
              name={pr.name}
              model={pr.model}
              price={pr.price}
              maxPrice={pr.maxPrice}
              available={pr.available}
              variants={pr.dots}
              discount={pr.discount}
              /* Below `sm` this is a 38% rail card, so the full-width default
                 would fetch art roughly 2.5x wider than the box it fills. */
              imageSizes="(max-width:640px) 40vw, (max-width:1024px) 50vw, 25vw"
            />
          </div>
        ))}
      </div>
    </Section>
  );
}

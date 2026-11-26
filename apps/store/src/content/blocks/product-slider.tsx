import Link from "next/link";
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
      {p.title && <SectionHeader title={p.title} />}
      <div className="section-rail -mx-4 flex items-stretch px-4 sm:gap-4">
        {products.slice(0, p.limit ?? 8).map((pr, i) => (
          <div key={pr.id} className="section-rail-item flex flex-col self-stretch sm:w-72">
            <ShowcaseCard
              href={`/product/${pr.slug}`}
              name={pr.name}
              model={pr.model}
              price={pr.price}
              maxPrice={pr.maxPrice}
              available={pr.available}
              variants={pr.dots}
              discount={pr.discount}
              priority={i < 4}
              quality={65}
              className="h-auto flex-1"
              /* Below `sm` this is a ~58% rail card, matching `.section-rail-item`. */
              imageSizes="(max-width:640px) 58vw, (max-width:1024px) 50vw, 25vw"
            />
          </div>
        ))}
        {/* End of rail circular "مشاهده همه" card */}
        <div className="section-rail-item flex items-stretch self-stretch sm:w-60">
          <Link
            href="/products"
            className="group flex min-h-[260px] w-full flex-col items-center justify-center gap-3.5 rounded-card border-2 border-dashed border-flame-200 bg-flame-50/40 p-6 text-center transition-all duration-200 hover:border-flame-500 hover:bg-flame-50"
          >
            <span className="flex size-14 items-center justify-center rounded-full border-2 border-flame-300 bg-canvas text-flame-700 shadow-sm transition-all duration-200 group-hover:scale-110 group-hover:border-flame-600 group-hover:bg-flame-600 group-hover:text-white sm:size-16">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-transform duration-200 group-hover:-translate-x-1"
                aria-hidden
              >
                <path d="M19 12H5" />
                <path d="m12 19-7-7 7-7" />
              </svg>
            </span>
            <span className="font-display text-sm font-black text-flame-900 transition-colors group-hover:text-flame-700">
              مشاهده همه
            </span>
          </Link>
        </div>
      </div>
    </Section>
  );
}

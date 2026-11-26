import Link from "next/link";
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
          <div key={pr.id} className="section-rail-item relative flex flex-col self-stretch">
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
              priority={i < 4}
              quality={65}
              className="h-auto flex-1"
              /* The rail card is ~58% of the viewport on a phone, so the
                 two-up default would still fetch wider art than needed. */
              imageSizes="(max-width:640px) 58vw, (max-width:1024px) 50vw, 25vw"
            />
          </div>
        ))}
        {/* End-of-rail circular "مشاهده همه" button matching user requirement 2 */}
        <div className="section-rail-item flex items-stretch self-stretch sm:hidden">
          <Link
            href="/products"
            className="group flex min-h-[260px] w-full flex-col items-center justify-center gap-3.5 rounded-card border-2 border-dashed border-flame-200 bg-flame-50/40 p-5 text-center transition-all duration-200 hover:border-flame-500 hover:bg-flame-50"
          >
            <span className="flex size-14 items-center justify-center rounded-full border-2 border-flame-300 bg-canvas text-flame-700 shadow-sm transition-all duration-200 group-hover:scale-110 group-hover:border-flame-600 group-hover:bg-flame-600 group-hover:text-white">
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

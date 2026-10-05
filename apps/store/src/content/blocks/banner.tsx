import Image from "next/image";
import Link from "next/link";
import type { ComponentProps } from "@kmodern/contracts";
import { hrefFor } from "@/lib/nav";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";

/**
 * `banner`, `bannerPair` and `bannerTrio` are one drawing at three column counts, so they are one
 * module registered under three keys rather than three modules that differ by a `cols` constant.
 * The trio is a shape, not a block type of its own.
 */
export async function BannerBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["banner"] & { banners?: ComponentProps["banner"][] };
  const items = p.banners ?? [p];
  const cols = block.type === "banner" ? 1 : block.type === "bannerPair" ? 2 : 3;
  const links = await Promise.all(items.map(async (banner) => (banner.image?.link ? hrefFor(banner.image.link) : null)));
  return (
    <Section id={p.anchorId}>
      {/* Rail on phones (see `.section-rail`), the authored column count from md up. */}
      <div className={`section-rail grid gap-3 sm:gap-4 ${cols === 1 ? "mx-auto max-w-[1100px]" : cols === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
        {items.map((banner, index) => {
          const link = links[index];
          // An ink panel with a lit edge, not a grey slab: the banner is the
          // one place on the page allowed to be dark, which is what kept it
          // reading as "another card" before.
          const inner = (
            <div className="group relative grid h-full overflow-hidden rounded-card bg-ink md:grid-cols-2">
              <div className="relative order-2 flex flex-col items-center justify-center gap-3 p-5 text-center sm:gap-4 sm:p-10 md:order-1 md:items-start md:text-start">
                {banner.title && (
                  <h3 className="text-balance font-display text-xl font-extrabold leading-tight text-white sm:text-3xl">
                    {banner.title}
                  </h3>
                )}
                {banner.subtitle && <p className="max-w-[34rem] text-sm leading-7 text-white/55">{banner.subtitle}</p>}
                {link && (
                  <span className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-white">
                    <span className="border-b border-white/25 pb-0.5 transition-colors duration-200 group-hover:border-flame-600">
                      مشاهده
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M19 12H5" />
                      <path d="m12 19-7-7 7-7" />
                    </svg>
                  </span>
                )}
              </div>
              <div className="relative order-1 min-h-44 bg-white/5 sm:min-h-64 md:order-2 md:min-h-[22rem]">
                <span
                  aria-hidden
                  className="absolute inset-y-0 start-0 w-px bg-gradient-to-b from-transparent via-flame-600/70 to-transparent"
                />
                {/* Catalog shots are cut-outs on white. On the ink panel that
                    white has to become a deliberate stage, not a stray
                    square, so the photo is inset on its own rounded plate. */}
                {banner.image?.src && (
                  <div className="absolute inset-5 overflow-hidden rounded-card bg-white sm:inset-8">
                    <Image
                      src={banner.image.src}
                      alt={banner.image.alt ?? banner.title ?? ""}
                      fill
                      sizes="(max-width:768px) 100vw, 40vw"
                      className="object-contain p-4 transition-transform duration-700 group-hover:scale-[1.04] motion-reduce:transform-none"
                    />
                  </div>
                )}
              </div>
            </div>
          );
          return link ? (
            <Link key={`${banner.image?.src ?? "banner"}-${index}`} href={link.href} target={link.newTab ? "_blank" : undefined} rel={link.newTab ? "noopener noreferrer" : undefined} className={`section-rail-item ${cols === 1 ? "section-rail-item-full" : "section-rail-item-wide"} block rounded-card focus-visible:outline-offset-4`}>
              {inner}
            </Link>
          ) : (
            <div key={`${banner.image?.src ?? "banner"}-${index}`} className={`section-rail-item ${cols === 1 ? "section-rail-item-full" : "section-rail-item-wide"}`}>{inner}</div>
          );
        })}
      </div>
    </Section>
  );
}

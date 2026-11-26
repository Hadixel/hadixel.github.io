import Image from "next/image";
import Link from "next/link";
import type { ComponentProps } from "@kmodern/contracts";
import { hrefFor } from "@/lib/nav";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";
import { ShimmerImage } from "@/components/shimmer-image";

/**
 * `banner`, `bannerPair` and `bannerTrio` are one drawing at three column counts, so they are one
 * module registered under three keys rather than three modules that differ by a `cols` constant.
 * The trio is a shape, not a block type of its own.
 */
export async function BannerBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["banner"] & { banners?: ComponentProps["banner"][] };
  const items = p.banners ?? [p];
  const cols = block.type === "banner" ? 1 : block.type === "bannerPair" ? 2 : 3;
  const links = await Promise.all(
    items.map(async (banner, index) => {
      // 1. First check gateway-resolved link from block.data (e.g. block.data.links[index] or block.data.link)
      const dataLink = block.data?.links?.[index] ?? (index === 0 ? block.data?.link : null);
      if (dataLink?.href && dataLink.href !== "#") {
        return { href: dataLink.href, newTab: Boolean(dataLink.newTab) };
      }
      // 2. Fall back to hrefFor if banner.image?.link provides a resolved or resolvable link
      if (banner.image?.link) {
        const resolved = await hrefFor(banner.image.link);
        if (resolved.href && resolved.href !== "#") {
          return resolved;
        }
      }
      return null;
    }),
  );
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
            <div className="group relative grid h-full overflow-hidden rounded-card bg-gradient-to-br from-flame-950 via-ink to-flame-950 ring-1 ring-flame-800/40 md:grid-cols-2">
              <div className="relative order-2 flex flex-col items-center justify-center gap-3 p-5 text-center sm:gap-4 sm:p-10 md:order-1 md:items-start md:text-start">
                {banner.title && (
                  <h3 className="text-balance font-display text-xl font-extrabold leading-tight text-white sm:text-3xl">
                    {banner.title}
                  </h3>
                )}
                {banner.subtitle && <p className="max-w-[34rem] text-sm leading-7 text-flame-100/75">{banner.subtitle}</p>}
                {link && (
                  <span className="mt-1 inline-flex items-center gap-2 text-sm font-bold text-white transition-colors group-hover:text-flame-200 sm:mt-3">
                    <span className="border-b border-flame-400/50 pb-0.5 transition-colors duration-200 group-hover:border-flame-400">
                      مشاهده
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M19 12H5" />
                      <path d="m12 19-7-7 7-7" />
                    </svg>
                  </span>
                )}
              </div>
              <div className="relative order-1 aspect-[16/10] bg-flame-900/20 sm:aspect-auto sm:min-h-64 md:order-2 md:min-h-[22rem]">
                <span
                  aria-hidden
                  className="hidden md:block absolute inset-y-0 start-0 w-px bg-gradient-to-b from-transparent via-flame-500/70 to-transparent"
                />
                {/* Inset rounded frame with edge-to-edge cover framing so landscape
                    showroom photography fills cleanly without thick white borders. */}
                {banner.image?.src && (
                  <div className="absolute inset-3 overflow-hidden rounded-card bg-white ring-1 ring-flame-200/40 sm:inset-6">
                    <ShimmerImage
                      src={banner.image.src}
                      alt={banner.image.alt ?? banner.title ?? ""}
                      fill
                      priority={index === 0}
                      sizes="(max-width: 768px) 90vw, (max-width: 1200px) 50vw, 400px"
                      className="object-cover transition-transform duration-700 group-hover:scale-[1.04] motion-reduce:transform-none"
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

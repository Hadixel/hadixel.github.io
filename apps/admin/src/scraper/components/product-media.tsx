"use client";

import { useEffect, useState } from "react";
import { safeExternalUrl, safePreviewUrl } from "@/scraper/lib/scraper-format";
import type { LiveProductRow, ScraperCatalogItem } from "@/scraper/lib/scraper-types";

/**
 * The three media cells the scraper renders: a catalogue product's thumbnail, a live row's
 * thumbnail, and a live row's link to the page it came from. They share one job — put a scraped
 * image or page URL on screen only after the sanitiser has cleared it.
 */

const frameClass =
  "block h-14 w-14 overflow-hidden rounded-card border border-plaster bg-white focus:outline-none focus:ring-2 focus:ring-flame-300";

function NoThumbnail() {
  return <div className="flex h-14 w-14 items-center justify-center rounded-card border border-plaster bg-white text-[10px] text-ash">بدون تصویر</div>;
}

/**
 * A catalogue product's images, walked one by one: a scraped gallery lists thumbnails and full-size
 * shots side by side, and the first URL that 404s is skipped for the next rather than left as a
 * broken image. The counter resets when the row's product changes.
 */
export function ProductThumbnail({ item }: { item: ScraperCatalogItem }) {
  const urls = [...new Set([...item.image, ...(item.sourceImages ?? [])])]
    .map((value) => safePreviewUrl(value))
    .filter((value): value is string => Boolean(value));
  const [imageIndex, setImageIndex] = useState(0);
  const url = urls[imageIndex];

  useEffect(() => setImageIndex(0), [item.slug]);

  if (!url) return <NoThumbnail />;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      className={frameClass}
      aria-label={`باز کردن تصویر ${item.name}`}
    >
      <img
        src={url}
        alt={item.name}
        className="h-full w-full object-contain"
        loading="lazy"
        onError={() => setImageIndex((current) => current + 1)}
      />
    </a>
  );
}

/**
 * A plain <img>, deliberately, not `next/image`: the row's image is whatever the manufacturer's
 * page pointed at (datees.ir and friends) and `next.config.ts` declares no `images.remotePatterns`,
 * so the optimiser refuses those hosts at runtime and the row renders as a broken image.
 */
export function LiveThumbnail({ row }: { row: LiveProductRow }) {
  const url = safePreviewUrl(row.image ?? undefined);
  if (!url) return <NoThumbnail />;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={frameClass}
      aria-label={`باز کردن تصویر ${row.name}`}
    >
      <img src={url} alt={row.name} className="h-full w-full object-contain" loading="lazy" />
    </a>
  );
}

export function LiveSourceLink({ row }: { row: LiveProductRow }) {
  const url = safeExternalUrl(row.url ?? undefined);
  if (!url) return <span className="whitespace-nowrap text-xs text-ash">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="whitespace-nowrap text-xs text-flame-700 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-flame-300"
    >
      باز کردن صفحه
    </a>
  );
}

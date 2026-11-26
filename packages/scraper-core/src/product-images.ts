// Every image a product page ships for one product, however it chose to load them.
//
// A gallery is the part of a product page that gets rebuilt for speed more than any other: the
// file moves into a lazy attribute, then into `srcset`, then behind a full-size link with the
// visible `src` scaled down. An extractor that reads one attribute captures the page as it looks
// when that trick happens not to be in use, so the set of images a product keeps ends up
// depending on the day the markup was written. This walk reads every attribute a URL can hide
// in, in the order the adapter says to trust them, and keeps the first one that qualifies per
// `<img>` — so WooCommerce's `data-large_image` wins over the thumbnail's `src` without also
// collecting both files.
//
// Two things it deliberately does not do. It stays on `<img>` tags rather than scanning raw
// text, because a page that embeds its data as JSON — the Datees Nuxt payload among them —
// carries category icons and related products in the same strings as the gallery. And it skips
// thumbnails, which are the same file at a smaller size: downloading both is the same product
// image twice.

import type { CheerioAPI } from "cheerio";

export interface ImageCollectOptions {
  /** Origin candidates must resolve against and stay on; e.g. `https://datees.ir`. */
  origin: string;
  /** Product images live under this path; e.g. `/uploads/`. */
  pathPrefix: string;
  /**
   * Attributes an image URL may hide in, most authoritative first. The default reads the plain
   * source, then the lazy-loading spellings, then `srcset`; an adapter whose gallery keeps the
   * full-size file elsewhere puts that attribute first.
   */
  urlAttributes?: readonly string[];
  /** Any URL whose path contains this marker is a thumbnail of another image. */
  thumbMarker?: string;
  /** Narrow the walk to a node, for a page that also shows other products' images. */
  selector?: string;
  /** A per-URL rejection, e.g. WooCommerce's placeholder graphic. */
  reject?: (url: string) => boolean;
}

const DEFAULT_URL_ATTRIBUTES = [
  "src",
  "data-src",
  "data-lazy-src",
  "data-original",
  "data-image",
  "data-large_image",
  "srcset",
] as const;

/** A `srcset` value is a candidate list; the first entry is the one the gallery itself shows. */
function srcsetFirst(value: string): string | undefined {
  const first = value.split(",")[0]?.trim().split(/\s+/)[0];
  return first && first.length ? first : undefined;
}

/**
 * The product images in `$`, in document order, each `<img>` contributing at most one file.
 *
 * Document order is the gallery's own order: the first image on a product page is the one the
 * page leads with, and the review list and the storefront both show the images in that order.
 * Duplicates are collapsed by filename, so a gallery that repeats an entry — which datees.ir
 * does, listing one slide twice under two positions — is downloaded once.
 */
export function collectImageUrls($: CheerioAPI, options: ImageCollectOptions): string[] {
  let origin: URL;
  try {
    origin = new URL(options.origin);
  } catch {
    return [];
  }
  const attributes = options.urlAttributes ?? DEFAULT_URL_ATTRIBUTES;
  const thumbMarker = options.thumbMarker ?? "/thumb/";
  const urls: string[] = [];
  const seenFilenames = new Set<string>();

  $(options.selector ?? "img").each((_i, element) => {
    for (const attribute of attributes) {
      const raw = $(element).attr(attribute);
      if (!raw) continue;
      const candidate = attribute === "srcset" ? srcsetFirst(raw) : raw.trim();
      if (!candidate) continue;

      let url: URL;
      try {
        url = new URL(candidate, origin);
      } catch {
        continue;
      }
      // Off-origin files are somebody else's image: a CDN link in a shared theme, a tracking
      // pixel, a shop server's avatar. The product's own files are on the product's host.
      if (url.host !== origin.host) continue;
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      if (!url.pathname.startsWith(options.pathPrefix)) continue;
      if (url.pathname.includes(thumbMarker)) continue;
      const absolute = url.toString();
      if (options.reject?.(absolute)) continue;

      const filename = url.pathname.split("/").pop() ?? "";
      if (!filename || seenFilenames.has(filename)) continue;
      seenFilenames.add(filename);
      urls.push(absolute);
      // The first qualifying attribute is this image's file; the rest spell the same picture.
      break;
    }
  });

  return urls;
}

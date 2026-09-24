// Pluggable source adapters. Adding "a few more sites" = one object here.
// An adapter owns everything site-specific: entry points, listing traversal,
// and page→ScrapeRecord extraction. Refinement stays shared.

import * as cheerio from "cheerio";
import type { ScrapeRecord, RawSpec } from "./types";
import type { FetchOptions } from "./http";
import { fetchHtml } from "./http";

export interface SourceTaxonomy {
  category: string;
  subCategory: string;
}

export interface SourceAdapter {
  id: string; // stable key, recorded on every ScrapeRecord
  brand: string; // default Brand attribution
  /** Discover all product URLs (category crawl or flat list). */
  listProducts(fetchOpts?: FetchOptions): Promise<string[]>;
  /** Optional taxonomy learned while discovering a product URL. */
  taxonomyFor?(url: string): SourceTaxonomy | null;
  /** Extract one product page. Throw on unrecoverable parse failure. */
  parseProduct(url: string, html: string): ScrapeRecord;
}

// ---------------------------------------------------------------------------
// datees.ir — server-rendered static HTML.
// Categories: /product_cat/<fa-slug>; products: /product/<fa-slug>.
// No prices (manufacturer site). Images: /uploads/*.webp (+ /uploads/thumb/*).
// Specs: heading "مشخصات محصول" then alternating label/value lines.
// Features: bullet list under "مشخصات" with inline SVG icons.
// ---------------------------------------------------------------------------

const DATEES_ORIGIN = "https://datees.ir";

// Root category mapping: fa slug → our Latin taxonomy (must cover seed.ts FA_ROOTS)
type DateesTaxonomy = { category: string; sub: string };

const DATEES_CATEGORIES: Record<string, DateesTaxonomy> = {
  "\u0627\u062C\u0627\u0642-\u06AF\u0627\u0632": { category: "stove", sub: "built-in" }, // اجاق-گاز
  "\u0641\u0631-\u062A\u0648\u06A9\u0627\u0631": { category: "oven", sub: "built-in" }, // فر-توکار
  "\u0647\u0648\u062F": { category: "hood", sub: "chimney" }, // هود
  "\u0633\u06CC\u0646\u06A9": { category: "sink", sub: "steel" }, // سینک
  "\u0641\u0631-\u0628\u0631\u0642\u06CC-\u0631\u0648\u0645\u06CC\u0632\u06CC": { category: "oven", sub: "steel" }, // فر-برقی-رومیزی
  "\u0645\u0627\u06CC\u06A9\u0631\u0648\u0648\u06CC\u0648": { category: "oven", sub: "glass" }, // مایکروویو
  "\u062C\u0627\u0631\u0648-\u0628\u0631\u0642\u06CC": { category: "hood", sub: "glass" }, // جارو-برقی — no vacuum root yet; park under closest
  "\u0686\u0627\u06CC\u0633\u0627\u0632": { category: "air-fryer", sub: "dual-basket" }, // چایساز
};

const dateesProductTaxonomies = new Map<string, SourceTaxonomy>();

function normalizeCategorySlug(value: string): string {
  return decodeURIComponent(value).replace(/\u200C/g, "");
}

// Color words appearing in names/specs → Latin token (seed COLOR_TOKENS)
const DATEES_COLOR_WORDS: [RegExp, string][] = [
  [/(\u0645\u0634\u06A9\u06CC|\u0633\u06CC\u0627\u0647)/, "black"], // مشکی/سیاه
  [/(\u0633\u0641\u06CC\u062F|\u0635\u0648\u0631\u062A\u06CC)/, "white"], // سفید/صورتی→white bucket
  [/\u0637\u0648\u0633\u06CC/, "gray"], // طوسی
  [/\u06A9\u0631\u0645/, "beige"], // کرم
  [/\u0646\u0642\u0631\u0647.\u06CC/, "silver"], // نقره‌ای
  [/(\u0627\u0633\u062A\u06CC\u0644|\u0632\u0646\u06AF|\u0645\u062A\u0627\u0644)/, "steel"], // استیل/زنگ/متال
];

function detectColors(...texts: string[]): string[] {
  const found = new Set<string>();
  const joined = texts.join(" ");
  for (const [re, token] of DATEES_COLOR_WORDS) if (re.test(joined)) found.add(token);
  return [...found];
}

export const datees: SourceAdapter = {
  id: "datees",
  brand: "Datees",

  async listProducts(fetchOpts) {
    const urls = new Set<string>();
    dateesProductTaxonomies.clear();

    for (const faSlug of Object.keys(DATEES_CATEGORIES)) {
      const catUrl = `${DATEES_ORIGIN}/product_cat/${encodeURIComponent(faSlug)}`;
      let html: string;
      try {
        html = await fetchHtml(catUrl, fetchOpts);
      } catch (error) {
        if (fetchOpts?.signal?.aborted) throw error;
        // A retired/misnamed category must not discard every other category.
        // fetchHtml's onError hook records the skipped request in the report.
        continue;
      }

      const $ = cheerio.load(html);
      $('a[href^="/product/"]').each((_i, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        const productUrl = new URL(href, DATEES_ORIGIN);
        if (productUrl.host !== "datees.ir" || !productUrl.pathname.startsWith("/product/")) return;

        const absoluteUrl = `${DATEES_ORIGIN}${productUrl.pathname}${productUrl.search}`;
        urls.add(absoluteUrl);
        if (!dateesProductTaxonomies.has(absoluteUrl)) {
          const taxonomy = DATEES_CATEGORIES[faSlug];
          dateesProductTaxonomies.set(absoluteUrl, {
            category: taxonomy.category,
            subCategory: taxonomy.sub,
          });
        }
      });
    }
    return [...urls];
  },

  taxonomyFor(url) {
    return dateesProductTaxonomies.get(url) ?? null;
  },

  parseProduct(url, html) {
    const $ = cheerio.load(html);
    const taxonomy = dateesProductTaxonomies.get(url);

    const name = $("h1").first().text().trim() || $("title").text().replace(/\s*-\s*\u062F\u0627\u062A\u06CC\u0633.*$/, "").trim();

    const description =
      $('meta[property="og:description"]').attr("content") ??
      $('meta[name="description"]').attr("content") ??
      "";

    // images: full-size /uploads/*.webp excluding thumbs; dedupe by basename
    const imageUrls: string[] = [];
    const seenBase = new Set<string>();
    $("img[src]").each((_i, el) => {
      const src = $(el).attr("src") ?? "";
      if (!src.startsWith("/uploads/") || src.includes("/thumb/")) return;
      const abs = new URL(src, DATEES_ORIGIN).toString();
      const base = abs.split("/").pop()!;
      if (seenBase.has(base)) return;
      seenBase.add(base);
      imageUrls.push(abs);
    });

    // Features live in the product card's "مشخصات" list, not in the site nav.
    const features: string[] = [];
    const featureHeading = $("div")
      .filter((_i, el) => {
        const $el = $(el);
        return $el.children().length === 0 && $el.text().replace(/\s+/g, " ").trim() === "مشخصات";
      })
      .first();
    const featureItems = featureHeading.length
      ? featureHeading.siblings("ul").find("li")
      : $("li").filter((_i, el) => {
          const className = $(el).attr("class") ?? "";
          return className.includes("my-3") && $(el).find("svg").length > 0;
        });
    featureItems.each((_i, el) => {
      const clean = $(el).clone().find("svg").remove().end().text().replace(/\s+/g, " ").trim();
      if (clean.length >= 4) features.push(clean);
    });

    // Datees renders each spec as a direct sibling of the h2 heading, with
    // label/value text separated into child elements. Parse the direct row
    // first; fall back to descendants for other HTML layouts.
    const specs: RawSpec[] = [];
    const addSpec = (raw: string): boolean => {
      const text = raw.replace(/\s+/g, " ").trim();
      const match = text.match(/^(.+?)\s*[:：]\s*(.+)$/);
      if (!match) return false;
      const label = match[1].replace(/\s+/g, " ").trim();
      const value = match[2].replace(/\s+/g, " ").trim();
      if (!label || !value || label.length > 80) return false;
      specs.push({ label, value });
      return true;
    };
    const specHeading = $("h2")
      .filter((_i, el) => $(el).text().includes("\u0645\u0634\u062E\u0635\u0627\u062A \u0645\u062D\u0635\u0648\u0644"))
      .first();
    specHeading.nextAll().each((_i, el) => {
      const $el = $(el);
      if ($el.is("h2")) return false;
      if (addSpec($el.text())) return;

      const cells = $el.find("th, td");
      if (cells.length >= 2) {
        addSpec(`${cells.eq(0).text()} : ${cells.slice(1).text()}`);
        return;
      }
      $el.find("dt, dd, tr, li, p, div").each((_j, child) => {
        addSpec($(child).text());
      });
    });

    const colors = detectColors(name, ...features, ...specs.map((s) => s.value));

    return {
      sourceId: this.id,
      url,
      name,
      brand: this.brand,
      categorySlug: taxonomy?.category ?? "",
      subCategorySlug: taxonomy?.subCategory ?? "",
      colors: colors.length ? colors : ["steel"],
      price: null,
      imageUrls,
      description,
      features,
      specs,
      scrapedAt: Date.now(),
    };
  },
};

/** Infer our Latin taxonomy from the crawled category page a product came from. */
export function categoryFor(sourceId: string, faCatSlug: string): DateesTaxonomy | null {
  if (sourceId !== "datees") return null;
  const decoded = normalizeCategorySlug(faCatSlug);
  return DATEES_CATEGORIES[decoded] ?? null;
}

export const SOURCES: Record<string, SourceAdapter> = { datees };
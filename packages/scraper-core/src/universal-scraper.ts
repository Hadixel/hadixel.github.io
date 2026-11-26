// Universal product extractor: ingests single product pages or category listings from any website.
// Uses a multi-tiered extraction strategy:
// 1. Schema.org / JSON-LD Product schema (highest fidelity)
// 2. OpenGraph and standard e-commerce meta tags
// 3. Cheerio DOM heuristics for Persian appliance layouts (WooCommerce, Digikala-like structures)
// 4. Automatic Persian appliance categorization and model extraction

import * as cheerio from "cheerio";
import { fetchHtml, type FetchOptions } from "./http";
import { normalizeFa, extractModel, makeSlug, polishCopy } from "./refine";
import { detectColors } from "./sources";
import type { RawSpec, RefinedProduct, ScrapeRecord } from "./types";

export interface UniversalScrapeOptions {
  brand?: string;
  limit?: number; // max products if URL is a listing/category page
  fetchOpts?: FetchOptions;
}

export interface UniversalScrapeResult {
  kind: "single" | "category";
  url: string;
  products: RefinedProduct[];
  totalDiscovered: number;
  errors: { url: string; message: string }[];
}

// Persian appliance keywords mapping to canonical categories and subcategories
const CATEGORY_MAP: { pattern: RegExp; category: string; subCategory: string }[] = [
  { pattern: /فر\s*توکار/i, category: "oven", subCategory: "built-in" },
  { pattern: /فر\s*(برقی|رومیزی|مایکروویو)/i, category: "oven", subCategory: "freestanding" },
  { pattern: /فر\b/i, category: "oven", subCategory: "built-in" },
  { pattern: /هود\s*مخفی/i, category: "hood", subCategory: "hidden" },
  { pattern: /هود\s*(شومینه|مورب)/i, category: "hood", subCategory: "chimney" },
  { pattern: /هود\b/i, category: "hood", subCategory: "chimney" },
  { pattern: /اجاق\s*گاز|گاز\s*(صفحه|رومیزی|توکار)/i, category: "stove", subCategory: "built-in" },
  { pattern: /گاز\b/i, category: "stove", subCategory: "built-in" },
  { pattern: /سینک\s*گرانیت/i, category: "sink", subCategory: "granite" },
  { pattern: /سینک\s*استیل/i, category: "sink", subCategory: "steel" },
  { pattern: /سینک\b/i, category: "sink", subCategory: "steel" },
  { pattern: /شیر\s*(آلات|روشویی|ظرفشویی)/i, category: "faucet", subCategory: "kitchen" },
  { pattern: /شیرآلات\b/i, category: "faucet", subCategory: "kitchen" },
  { pattern: /مایکروویو|ماکروفر/i, category: "microwave", subCategory: "built-in" },
  { pattern: /چایساز|چای\s*ساز/i, category: "kettle", subCategory: "electric" },
  { pattern: /جارو\s*برقی/i, category: "vacuum", subCategory: "corded" },
];

export function inferCategory(text: string): { category: string; subCategory: string } {
  for (const item of CATEGORY_MAP) {
    if (item.pattern.test(text)) {
      return { category: item.category, subCategory: item.subCategory };
    }
  }
  return { category: "appliance", subCategory: "general" };
}

/** Parses raw string into clean number in Tomans, handling Persian digits, commas, and Rial/Toman units. */
export function parsePriceToman(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    if (raw <= 0) return null;
    // If clearly in Rials (> 10,000,000 with a suspicious extra zero for appliances)
    return raw > 100_000_000 ? Math.round(raw / 10) : raw;
  }
  const clean = normalizeFa(raw).replace(/[\s,،/._]/g, "");
  const numMatch = clean.match(/\d+/);
  if (!numMatch) return null;
  let val = Number.parseInt(numMatch[0], 10);
  if (Number.isNaN(val) || val <= 0) return null;

  const isRial = /ریال|irr/i.test(raw);
  const isToman = /تومان|toman|irt/i.test(raw);

  if (isRial) {
    val = Math.round(val / 10);
  } else if (!isToman && val >= 50_000_000) {
    // Heuristic: typical appliance prices in Iran are 5M - 80M Tomans (50M - 800M Rials).
    // An unlabelled number over 50M is almost always Rials.
    val = Math.round(val / 10);
  }
  return val;
}

/** Extracts high-resolution image candidates from Cheerio DOM element. */
function extractImageSrc(el: cheerio.Cheerio<any>, baseUrl: string): string | null {
  const attrs = [
    el.attr("data-large_image"),
    el.attr("data-full-image"),
    el.attr("data-zoom-image"),
    el.attr("data-src"),
    el.attr("data-original"),
    el.attr("src"),
  ];
  for (const attr of attrs) {
    if (attr && !attr.startsWith("data:") && !attr.includes("placeholder")) {
      try {
        return new URL(attr, baseUrl).toString();
      } catch {
        /* skip invalid url */
      }
    }
  }
  return null;
}

/** Evaluates whether page HTML represents a single product or a catalog listing. */
export function isProductPage(html: string, url: string): boolean {
  const $ = cheerio.load(html);

  // 1. JSON-LD explicitly declaring Product
  let hasJsonLdProduct = false;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const items = Array.isArray(data) ? data : data["@graph"] ?? [data];
      for (const item of items) {
        if (item["@type"] === "Product" || item["@type"] === "IndividualProduct") {
          hasJsonLdProduct = true;
          break;
        }
      }
    } catch {
      /* ignore invalid JSON */
    }
  });
  if (hasJsonLdProduct) return true;

  // 2. OpenGraph type == product
  const ogType = $('meta[property="og:type"]').attr("content");
  if (ogType === "product") return true;

  // 3. WooCommerce / E-commerce single product containers
  if ($(".single-product, .product-template, button[name='add-to-cart'], .cart .single_add_to_cart_button").length > 0) {
    return true;
  }

  // 4. URL path hints: if url ends with product pattern and page has a single h1
  if (/\/(product|item|p|pd)\//i.test(url) && $("h1").length === 1) {
    return true;
  }

  return false;
}

/** Extracts candidate product URLs from a category/listing page. */
export function extractProductLinks(html: string, baseUrl: string, limit: number = 20): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();
  const host = new URL(baseUrl).host;

  $('a[href*="/product/"], a[href*="/p/"], a[href*="/item/"], .products a, .product a, .item a').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.host === host && resolved.pathname !== new URL(baseUrl).pathname) {
        // Exclude pagination, cart, wishlist, and filter links
        if (!/[?&](add-to-cart|remove_item|filter)/i.test(resolved.search)) {
          links.add(`${resolved.origin}${resolved.pathname}`);
        }
      }
    } catch {
      /* ignore invalid */
    }
  });

  return Array.from(links).slice(0, limit);
}

/** Core parser: extracts one product from raw HTML and converts it to a RefinedProduct. */
export function parseGenericProductHtml(html: string, pageUrl: string, defaultBrand: string = ""): RefinedProduct {
  const $ = cheerio.load(html);
  const origin = new URL(pageUrl).origin;

  let title = "";
  let brand = defaultBrand;
  let price: number | null = null;
  let description = "";
  const specs: RawSpec[] = [];
  const imageUrls: string[] = [];
  const features: string[] = [];

  // --- Tier 1: JSON-LD Product Extraction ---
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const items = Array.isArray(data) ? data : data["@graph"] ?? [data];
      for (const item of items) {
        if (item["@type"] === "Product" || item["@type"] === "IndividualProduct") {
          if (!title && item.name) title = String(item.name);
          if (!description && item.description) description = String(item.description);

          if (!brand) {
            if (typeof item.brand === "string") brand = item.brand;
            else if (item.brand?.name) brand = String(item.brand.name);
          }

          if (price == null && item.offers) {
            const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            if (offer?.price) price = parsePriceToman(offer.price);
            else if (offer?.lowPrice) price = parsePriceToman(offer.lowPrice);
          }

          if (item.image) {
            const imgs = Array.isArray(item.image) ? item.image : [item.image];
            for (const img of imgs) {
              const u = typeof img === "string" ? img : img?.url ?? img?.contentUrl;
              if (u) {
                try {
                  imageUrls.push(new URL(u, pageUrl).toString());
                } catch {
                  /* skip */
                }
              }
            }
          }

          if (Array.isArray(item.additionalProperty)) {
            for (const prop of item.additionalProperty) {
              if (prop.name && prop.value) {
                specs.push({
                  label: normalizeFa(String(prop.name)),
                  value: normalizeFa(String(prop.value)),
                });
              }
            }
          }
        }
      }
    } catch {
      /* ignore invalid JSON-LD */
    }
  });

  // --- Tier 2: OpenGraph & Meta Fallback ---
  if (!title) {
    title = $('meta[property="og:title"]').attr("content") || $("h1.product_title, h1.entry-title, h1").first().text();
  }
  if (!description) {
    description = $('meta[property="og:description"]').attr("content") || $('meta[name="description"]').attr("content") || "";
  }
  if (!brand) {
    brand = $('meta[property="product:brand"]').attr("content") || $('meta[property="og:site_name"]').attr("content") || "";
  }
  if (price == null) {
    const metaPrice = $('meta[property="product:price:amount"]').attr("content");
    if (metaPrice) price = parsePriceToman(metaPrice);
  }
  const ogImg = $('meta[property="og:image"]').attr("content");
  if (ogImg) {
    try {
      imageUrls.push(new URL(ogImg, pageUrl).toString());
    } catch {
      /* skip */
    }
  }

  // --- Tier 3: DOM Heuristics ---
  title = normalizeFa(title || $("h1").first().text());

  // Domestic appliance specifications table
  $("table.woocommerce-product-attributes tr, .shop_attributes tr, table tr, dl").each((_, el) => {
    const th = $(el).find("th, dt, td:first-child").text().trim();
    const td = $(el).find("td, dd").last().text().trim();
    if (th && td && th !== td && th.length <= 40) {
      specs.push({
        label: normalizeFa(th),
        value: normalizeFa(td),
      });
    }
  });

  // Feature bullets
  $(".woocommerce-product-details__short-description li, .features li, ul.specs li").each((_, el) => {
    const text = normalizeFa($(el).text());
    if (text && text.length > 3 && text.length < 160) {
      features.push(text);
    }
  });

  // Price from DOM
  if (price == null) {
    const priceText = $(".price ins .amount, .price .amount, .woocommerce-Price-amount, .price").first().text();
    if (priceText) {
      price = parsePriceToman(priceText);
    }
  }

  // Gallery image collection
  $(".woocommerce-product-gallery img, .product-images img, .gallery img, img[data-large_image], img[data-src]").each((_, el) => {
    const src = extractImageSrc($(el), pageUrl);
    if (src) imageUrls.push(src);
  });

  // Breadcrumbs for category / brand hints
  const breadcrumbsText = $(".woocommerce-breadcrumb, .breadcrumb, nav[aria-label='Breadcrumb']").text();
  const taxonomy = inferCategory(`${breadcrumbsText} ${title}`);

  // Deduplicate and filter images
  const uniqueImages = Array.from(new Set(imageUrls)).filter((u) => !u.endsWith(".svg") && !u.includes("icon"));

  // Detect colors
  const colors = detectColors(title, ...specs.map((s) => `${s.label} ${s.value}`));

  // Extract model code
  const model = extractModel(title, specs, { allowWordModels: true });

  // Clean description
  description = polishCopy(description || $(".woocommerce-product-details__short-description, #tab-description").text());

  const slug = makeSlug(brand || "appliance", model, title, specs);

  return {
    sourceId: "universal",
    url: pageUrl,
    slug,
    model: model || slug,
    name: title,
    brand: brand || defaultBrand || "متفرقه",
    categorySlug: taxonomy.category,
    subCategorySlug: taxonomy.subCategory,
    colors: colors.length > 0 ? colors : ["steel"],
    price,
    imageUrls: uniqueImages,
    description: description.slice(0, 1000),
    features: features.slice(0, 10),
    specs,
    scrapedAt: Date.now(),
  };
}

/**
 * Universal Scrape entry point:
 * Takes any valid public URL, determines whether it is a single product or category,
 * and extracts refined products ready for admin staging.
 */
export async function extractFromUrl(
  url: string,
  options: UniversalScrapeOptions = {},
): Promise<UniversalScrapeResult> {
  const fetchOpts = options.fetchOpts;
  const html = await fetchHtml(url, fetchOpts);
  const isSingle = isProductPage(html, url);

  if (isSingle) {
    const product = parseGenericProductHtml(html, url, options.brand);
    return {
      kind: "single",
      url,
      products: [product],
      totalDiscovered: 1,
      errors: [],
    };
  }

  // It's a category/listing page: find products and crawl
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
  const productLinks = extractProductLinks(html, url, limit);

  const products: RefinedProduct[] = [];
  const errors: { url: string; message: string }[] = [];

  for (const link of productLinks) {
    try {
      const pageHtml = await fetchHtml(link, fetchOpts);
      const product = parseGenericProductHtml(pageHtml, link, options.brand);
      products.push(product);
    } catch (err: any) {
      errors.push({
        url: link,
        message: err?.message ?? "Failed to fetch or parse product page",
      });
    }
  }

  return {
    kind: "category",
    url,
    products,
    totalDiscovered: productLinks.length,
    errors,
  };
}

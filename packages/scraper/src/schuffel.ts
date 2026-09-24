// schuffel.net — public WooCommerce Store API with an HTML fallback.
// The site is an informational catalog: prices are currently unavailable and
// intentionally remain null rather than being treated as free products.

import * as cheerio from "cheerio";
import { fetchHtml, type FetchOptions } from "./http";
import { normalizeFa } from "./refine";
import type { RawSpec, ScrapeRecord } from "./types";
import type { SourceAdapter, SourceTaxonomy } from "./sources";

const SCHUFFEL_ORIGIN = "https://schuffel.net";
const STORE_PRODUCTS_URL = `${SCHUFFEL_ORIGIN}/wp-json/wc/store/v1/products`;
const STORE_CATEGORIES_URL = `${SCHUFFEL_ORIGIN}/wp-json/wc/store/v1/products/categories`;
const PRODUCT_SITEMAP_URL = `${SCHUFFEL_ORIGIN}/product-sitemap.xml`;

type SchuffelBrand = "Schuffle" | "Zimon";
type SchuffelTaxonomy = SourceTaxonomy & { brand: SchuffelBrand };

interface StoreImage {
  src?: unknown;
}

interface StoreProduct {
  id?: unknown;
  name?: unknown;
  permalink?: unknown;
  description?: unknown;
  short_description?: unknown;
  categories?: unknown;
  brands?: unknown;
  images?: unknown;
  prices?: { price?: unknown; regular_price?: unknown };
  sku?: unknown;
  type?: unknown;
  is_purchasable?: unknown;
}

interface StoreCategory {
  id?: unknown;
  name?: unknown;
  slug?: unknown;
}

const schuffelProductTaxonomies = new Map<string, SchuffelTaxonomy>();
const schuffelProductRecords = new Map<string, ScrapeRecord>();

function textFromHtml(value: unknown): string {
  if (typeof value !== "string") return "";
  return cheerio.load(`<span>${value}</span>`)("span").text().replace(/\s+/g, " ").trim();
}

function cleanText(value: string): string {
  return value.replace(/\u200c/g, " ").replace(/[ \t]+/g, " ").trim();
}

function absoluteUrl(value: string, base = SCHUFFEL_ORIGIN): string | undefined {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function productUrl(value: unknown): string | undefined {
  return typeof value === "string" ? absoluteUrl(value) : undefined;
}

function numericPrice(value: unknown): number | null {
  const number = typeof value === "number"
    ? value
    : Number(normalizeFa(String(value ?? "")).replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function categoryTaxonomy(category: Pick<StoreCategory, "id" | "name" | "slug">): SchuffelTaxonomy {
  const name = `${category.name ?? ""} ${category.slug ?? ""}`.toLocaleLowerCase("fa");
  const brand: SchuffelBrand = name.includes("زیمون") || name.includes("zimon") ? "Zimon" : "Schuffle";
  if (name.includes("سینک")) return { brand, category: "sink", subCategory: name.includes("گرانیت") ? "granite" : "steel" };
  if (name.includes("هود")) {
    return {
      brand,
      category: "hood",
      subCategory: name.includes("دیواری") ? "wall" : name.includes("مخفی") ? "concealed" : "chimney",
    };
  }
  if (name.includes("فر") && !name.includes("اجاق")) return { brand, category: "oven", subCategory: "built-in" };
  if (name.includes("اجاق") || name.includes("گاز")) return { brand, category: "stove", subCategory: "freestanding" };
  return { brand, category: "oven", subCategory: "built-in" };
}

function categoryFromText(value: string): SchuffelTaxonomy {
  return categoryTaxonomy({ id: 0, name: value, slug: value });
}

function colorTokens(...values: string[]): string[] {
  const text = values.join(" ");
  const colors: string[] = [];
  const add = (token: string, pattern: RegExp) => {
    if (pattern.test(text) && !colors.includes(token)) colors.push(token);
  };
  add("black", /مشکی|سیاه|\bblack\b/i);
  add("white", /سفید|صدفی|\bwhite\b/i);
  add("gray", /طوسی|خاکستری|\bgray\b|\bgrey\b/i);
  add("beige", /کرم|بژ|\bbeige\b/i);
  add("silver", /نقره‌?ای|نقره ای|\bsilver\b/i);
  add("steel", /استیل|زنگ|\bsteel\b/i);
  return colors;
}

function richParts(html: unknown): string[] {
  if (typeof html !== "string" || !html.trim()) return [];
  const $ = cheerio.load(`<div id=\"scraper-root\">${html}</div>`);
  const parts: string[] = [];
  $("#scraper-root h4, #scraper-root p, #scraper-root li").each((_i, element) => {
    const node = $(element).clone();
    node.find("script,style").remove();
    node.find("br").each((_j, br) => {
      $(br).replaceWith("\n");
    });
    const text = cleanText(node.text());
    if (text && !parts.includes(text)) parts.push(text);
  });
  return parts;
}

function splitSpecParts(parts: string[]): { specs: RawSpec[]; features: string[] } {
  const specs: RawSpec[] = [];
  const features: string[] = [];
  for (const part of parts) {
    const lines = part.split(/\r?\n/).map(cleanText).filter(Boolean);
    for (const line of lines.length ? lines : [part]) {
      const match = line.match(/^(.{1,100}?)\s*[:：]\s*(.{1,300})$/);
      if (match) {
        const label = cleanText(match[1]);
        const value = cleanText(match[2]);
        if (label && value && !specs.some((spec) => spec.label === label)) specs.push({ label, value });
      } else if (line.length >= 3 && line.length <= 240 && !features.includes(line)) {
        features.push(line);
      }
    }
  }
  return { specs, features };
}

function mergeUnique(...groups: string[][]): string[] {
  const out: string[] = [];
  for (const group of groups) {
    for (const value of group) {
      const clean = cleanText(value);
      if (clean && !out.includes(clean)) out.push(clean);
    }
  }
  return out;
}

function imageUrls(product: StoreProduct): string[] {
  if (!Array.isArray(product.images)) return [];
  const urls: string[] = [];
  for (const raw of product.images) {
    const image = raw as StoreImage;
    const url = productUrl(image?.src);
    if (url && !/woocommerce-placeholder/i.test(url) && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

function productBrand(product: StoreProduct, fallback: SchuffelBrand): SchuffelBrand {
  const values = Array.isArray(product.brands) ? product.brands : [];
  const text = values.map((value) => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      const name = (value as { name?: unknown }).name;
      return typeof name === "string" ? name : "";
    }
    return "";
  }).join(" ").toLocaleLowerCase("en");
  return /zimon|زیمون/.test(text) ? "Zimon" : fallback;
}

function makeStoreRecord(product: StoreProduct, taxonomy: SchuffelTaxonomy): ScrapeRecord | null {
  const name = textFromHtml(product.name);
  const url = productUrl(product.permalink);
  if (!name || !url) return null;
  const shortParts = richParts(product.short_description);
  const longParts = richParts(product.description);
  const shortData = splitSpecParts(shortParts);
  const longData = splitSpecParts(longParts);
  const description = mergeUnique(longParts, shortParts).join("\n");
  const specs = mergeUnique(shortData.specs.map((spec) => spec.label)).length
    ? shortData.specs
    : longData.specs;
  const features = mergeUnique(longData.features, shortData.features);
  const colors = colorTokens(name, description, ...features, ...specs.map((spec) => spec.value));
  return {
    sourceId: "schuffel",
    url,
    name,
    brand: productBrand(product, taxonomy.brand),
    categorySlug: taxonomy.category,
    subCategorySlug: taxonomy.subCategory,
    colors: colors.length ? colors : ["steel"],
    price: numericPrice(product.prices?.price) ?? numericPrice(product.prices?.regular_price),
    imageUrls: imageUrls(product),
    description,
    features,
    specs,
    scrapedAt: Date.now(),
  };
}

function makeHtmlRecord(url: string, html: string): ScrapeRecord {
  const $ = cheerio.load(html);
  const canonical = $('link[rel="canonical"]').attr("href");
  const sourceUrl = productUrl(canonical) ?? url;
  const name = $("h1.product_title, h1.entry-title, h1").first().text().replace(/\s+/g, " ").trim();
  const categoryName = $(".product_meta .posted_in a").first().text().trim();
  const taxonomy = categoryFromText(categoryName);
  const shortHtml = $(".woocommerce-product-details__short-description").html() ?? "";
  const longHtml = $("#tab-description").html() ?? "";
  const shortParts = richParts(shortHtml);
  const longParts = richParts(longHtml);
  const shortData = splitSpecParts(shortParts);
  const longData = splitSpecParts(longParts);
  const description = mergeUnique(longParts, shortParts).join("\n");
  const specs = shortData.specs.length ? shortData.specs : longData.specs;
  const features = mergeUnique(longData.features, shortData.features);
  const images: string[] = [];
  $(".woocommerce-product-gallery__image img, .woocommerce-product-gallery img").each((_i, element) => {
    const node = $(element);
    const raw = node.attr("data-large_image") ?? node.attr("data-src") ?? node.attr("src");
    const image = productUrl(raw);
    if (image && !/woocommerce-placeholder/i.test(image) && !images.includes(image)) images.push(image);
  });
  const priceText = $(".summary .price .woocommerce-Price-amount, .summary .price .amount").first().text();
  const colors = colorTokens(name, description, ...features, ...specs.map((spec) => spec.value));
  if (!name) throw new Error("Schuffel product name not found");
  return {
    sourceId: "schuffel",
    url: sourceUrl,
    name,
    brand: taxonomy.brand,
    categorySlug: taxonomy.category,
    subCategorySlug: taxonomy.subCategory,
    colors: colors.length ? colors : ["steel"],
    price: numericPrice(priceText),
    imageUrls: images,
    description,
    features,
    specs,
    scrapedAt: Date.now(),
  };
}

function taxonomyFromProductCategory(raw: unknown): SchuffelTaxonomy | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.name !== "string") return null;
  return categoryTaxonomy({
    id: typeof value.id === "number" ? value.id : 0,
    name: value.name,
    slug: typeof value.slug === "string" ? value.slug : "",
  });
}

async function fetchJson(url: string, fetchOpts: FetchOptions): Promise<unknown> {
  const body = await fetchHtml(url, fetchOpts);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Invalid JSON from Schuffel: ${url}`);
  }
}

function mapCategory(raw: unknown): (StoreCategory & { id: number }) | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "number" || typeof value.name !== "string") return null;
  return { id: value.id, name: value.name, slug: typeof value.slug === "string" ? value.slug : "" };
}

async function listStoreProducts(fetchOpts: FetchOptions): Promise<StoreProduct[]> {
  const products: StoreProduct[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const url = `${STORE_PRODUCTS_URL}?per_page=100&page=${page}`;
    const payload = await fetchJson(url, fetchOpts);
    if (!Array.isArray(payload)) throw new Error("Schuffel Store API returned an invalid product list");
    products.push(...payload as StoreProduct[]);
    if (payload.length < 100) break;
  }
  return products;
}

async function listSitemapProducts(fetchOpts: FetchOptions): Promise<string[]> {
  const xml = await fetchHtml(PRODUCT_SITEMAP_URL, fetchOpts);
  const urls = [...xml.matchAll(/<loc>([^<]*\/product\/[^<]+)<\/loc>/gi)]
    .map((match) => productUrl(match[1]))
    .filter((url): url is string => Boolean(url));
  return [...new Set(urls)];
}

export const schuffel: SourceAdapter = {
  id: "schuffel",
  brand: "Schuffle",
  brands: ["Schuffle", "Zimon"],

  async listProducts(fetchOpts = {}) {
    schuffelProductTaxonomies.clear();
    schuffelProductRecords.clear();
    const categories = new Map<number, SchuffelTaxonomy>();
    try {
      const categoryPayload = await fetchJson(`${STORE_CATEGORIES_URL}?per_page=100`, fetchOpts);
      if (Array.isArray(categoryPayload)) {
        for (const raw of categoryPayload) {
          const category = mapCategory(raw);
          if (category) categories.set(category.id, categoryTaxonomy(category));
        }
      }
    } catch {
      // The product endpoint can still provide usable records without categories.
    }

    let products: StoreProduct[];
    try {
      products = await listStoreProducts(fetchOpts);
    } catch {
      return listSitemapProducts(fetchOpts);
    }
    const urls: string[] = [];
    for (const product of products) {
      const url = productUrl(product.permalink);
      if (!url) continue;
      const rawCategory = Array.isArray(product.categories) ? product.categories[0] : undefined;
      const categoryId = rawCategory && typeof rawCategory === "object"
        ? Number((rawCategory as { id?: unknown }).id)
        : Number(rawCategory);
      const taxonomy = categoryId !== undefined && categories.has(categoryId)
        ? categories.get(categoryId)!
        : taxonomyFromProductCategory(rawCategory) ?? categoryFromText(typeof product.name === "string" ? product.name : "");
      schuffelProductTaxonomies.set(url, taxonomy);
      const record = makeStoreRecord(product, taxonomy);
      if (record?.imageUrls.length) schuffelProductRecords.set(url, record);
      urls.push(url);
    }
    return urls;
  },

  taxonomyFor(url) {
    const taxonomy = schuffelProductTaxonomies.get(url);
    return taxonomy ? { category: taxonomy.category, subCategory: taxonomy.subCategory } : null;
  },

  productFor(url) {
    return schuffelProductRecords.get(url);
  },

  parseProduct(url, html) {
    return makeHtmlRecord(url, html);
  },
};

export { PRODUCT_SITEMAP_URL };

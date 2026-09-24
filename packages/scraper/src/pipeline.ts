// Orchestrator: crawl → scrape → refine/merge → emit catalog fragment.
// Each stage logs progress; failures on individual pages are collected, not fatal.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ScrapeRecord, RefinedProduct, MergeReport, ScrapeFilters, PriceLookupReport } from "./types";
import type { FetchOptions } from "./http";
import { fetchHtml } from "./http";
import { SOURCES, categoryFor } from "./sources";
import type { SourceAdapter, SourceTaxonomy } from "./sources";
import { extractModel, normalizeFa } from "./refine";
import { refineAndMerge } from "./merge";
import { downloadProductImages } from "./images";
import {
  DATEES_SHOP_CATALOG_URL,
  fetchDateesShopPriceIndex,
  matchDateesShopPrice,
} from "./price-sources";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT_DIR = join(HERE, "..", "out");

export type PipelineEvent =
  | { type: "source-start"; sourceId: string; brand: string }
  | { type: "listing-complete"; sourceId: string; count: number }
  | { type: "product-start"; sourceId: string; index: number; total: number; url: string }
  | { type: "product-complete"; sourceId: string; index: number; total: number; name: string }
  | { type: "product-error"; sourceId: string; url: string; message: string }
  | { type: "product-filtered"; sourceId: string; url: string; reason: string }
  | { type: "refine-start"; records: number }
  | { type: "refine-complete"; kept: number; merged: number; conflicts: number }
  | { type: "image-start"; total: number }
  | { type: "image-complete"; current: number; total: number; downloaded?: number; path: string }
  | { type: "image-error"; url: string; message: string };

export interface PipelineOptions {
  sources?: string[]; // subset of adapter ids; default all
  limit?: number; // max products per source (smoke runs)
  fetchOpts?: FetchOptions;
  quiet?: boolean;
  signal?: AbortSignal;
  outDir?: string;
  downloadImages?: boolean;
  imageDir?: string;
  imageMinIntervalMs?: number;
  imageMaxBytes?: number;
  filters?: ScrapeFilters;
  /** Enrich Datees records from the official Datees Shop price API. */
  priceLookup?: boolean;
  onProgress?: (event: PipelineEvent) => void;
}

export interface PipelineResult {
  products: RefinedProduct[];
  report: MergeReport;
  errors: { url: string; message: string }[];
  imageErrors: { url: string; message: string }[];
  imagesDownloaded: number;
  imagesTotal: number;
  filteredOut: number;
  priceLookup?: PriceLookupReport;
  outDir: string;
}

function log(opts: PipelineOptions, msg: string): void {
  if (!opts.quiet) console.log(msg);
}

function emit(opts: PipelineOptions, event: PipelineEvent): void {
  opts.onProgress?.(event);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const error = new Error("Pipeline cancelled");
    error.name = "AbortError";
    throw error;
  }
}

function activeFilter(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized !== "all" ? normalized : undefined;
}

function normalizedText(value: string): string {
  return normalizeFa(value).trim().toLocaleLowerCase("fa");
}

function urlHost(value: string): string | undefined {
  try {
    return new URL(value).hostname.toLocaleLowerCase("en");
  } catch {
    return undefined;
  }
}

function websiteMatches(url: string, filter: string | undefined): boolean {
  const wanted = activeFilter(filter);
  if (!wanted) return true;
  const host = urlHost(url);
  const normalizedWanted = normalizedText(wanted).replace(/^https?:\/\//, "").split("/")[0];
  return Boolean(host && normalizedWanted && (host === normalizedWanted || normalizedWanted.endsWith(`.${host}`) || host.endsWith(`.${normalizedWanted}`)));
}

function listingFilterReason(
  url: string,
  adapter: SourceAdapter,
  filters: ScrapeFilters,
): string | undefined {
  const manufacturer = activeFilter(filters.manufacturer);
  const adapterBrands = adapter.brands ?? [adapter.brand];
  if (manufacturer && !adapterBrands.some((brand) => normalizedText(brand) === normalizedText(manufacturer))) return "manufacturer";
  if (!websiteMatches(url, filters.website)) return "website";

  const taxonomy: SourceTaxonomy | null = adapter.taxonomyFor?.(url) ?? null;
  const category = activeFilter(filters.category);
  const subCategory = activeFilter(filters.subCategory);
  if (taxonomy && category && taxonomy.category !== category) return "category";
  if (taxonomy && subCategory && taxonomy.subCategory !== subCategory) return "subcategory";
  return undefined;
}

function productFilterReason(record: ScrapeRecord, filters: ScrapeFilters): string | undefined {
  const manufacturer = activeFilter(filters.manufacturer);
  if (manufacturer && normalizedText(record.brand) !== normalizedText(manufacturer)) return "manufacturer";
  if (!websiteMatches(record.url, filters.website)) return "website";
  if (activeFilter(filters.category) && record.categorySlug !== activeFilter(filters.category)) return "category";
  if (activeFilter(filters.subCategory) && record.subCategorySlug !== activeFilter(filters.subCategory)) return "subcategory";
  const color = activeFilter(filters.color);
  if (color && !record.colors.includes(color)) return "color";
  if (filters.price === "priced" && (record.price === null || record.price <= 0)) return "price";
  if (filters.price === "missing" && record.price !== null && record.price > 0) return "price";
  if (filters.content === "with-images" && record.imageUrls.length === 0) return "content";
  if (filters.content === "without-images" && record.imageUrls.length > 0) return "content";
  if (filters.content === "with-specs" && record.specs.length === 0) return "content";

  const search = activeFilter(filters.search);
  if (search) {
    const model = extractModel(record.name, record.specs);
    const searchable = [
      record.name,
      record.brand,
      model,
      record.url,
      record.description,
      ...record.features,
      ...record.specs.flatMap((spec) => [spec.label, spec.value]),
    ].join(" ");
    if (!normalizedText(searchable).includes(normalizedText(search))) return "search";
  }
  return undefined;
}

function sortProducts(products: RefinedProduct[], sort: ScrapeFilters["sort"]): RefinedProduct[] {
  const sorted = [...products];
  if (sort === "name") return sorted.sort((a, b) => a.name.localeCompare(b.name, "fa"));
  if (sort === "price-high") return sorted.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  if (sort === "price-low") return sorted.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  if (sort === "newest") return sorted.sort((a, b) => b.scrapedAt - a.scrapedAt);
  return sorted;
}

export async function runPipeline(opts: PipelineOptions = {}): Promise<PipelineResult> {
  const sourceIds = opts.sources ?? Object.keys(SOURCES);
  const allRecords: ScrapeRecord[] = [];
  const filters = opts.filters ?? {};
  const hasPostFilters = Boolean(
    activeFilter(filters.manufacturer) ||
    activeFilter(filters.search) ||
    activeFilter(filters.color) ||
    (filters.price && filters.price !== "all") ||
    (filters.content && filters.content !== "all") ||
    activeFilter(filters.sort),
  );
  let filteredOut = 0;
  const errors: { url: string; message: string }[] = [];
  const imageErrors: { url: string; message: string }[] = [];
  let imagesDownloaded = 0;
  let imagesTotal = 0;
  let priceLookup: PriceLookupReport | undefined;
  const signal = opts.signal ?? opts.fetchOpts?.signal;
  const fetchOpts = opts.signal
    ? { ...(opts.fetchOpts ?? {}), signal: opts.signal }
    : opts.fetchOpts;
  const outDir = opts.outDir ?? DEFAULT_OUT_DIR;
  const listingFetchOpts: FetchOptions = {
    ...(fetchOpts ?? {}),
    onError: (error, url) => {
      errors.push({ url, message: String(error) });
      fetchOpts?.onError?.(error, url);
    },
  };

  for (const id of sourceIds) {
    throwIfAborted(signal);
    const adapter = SOURCES[id];
    if (!adapter) {
      log(opts, `⚠ unknown source "${id}" — skipping`);
      continue;
    }

    emit(opts, { type: "source-start", sourceId: id, brand: adapter.brand });
    log(opts, `\n▶ crawling ${adapter.id} (${adapter.brand})…`);
    let urls: string[];
    try {
      urls = await adapter.listProducts(listingFetchOpts);
    } catch (e) {
      if (signal?.aborted) throw e;
      errors.push({ url: adapter.id, message: String(e) });
      log(opts, `✗ list failed: ${String(e)}`);
      continue;
    }

    const discoveredCount = urls.length;
    const candidateUrls = urls.filter((url) => {
      const reason = listingFilterReason(url, adapter, filters);
      if (reason) {
        filteredOut += 1;
        return false;
      }
      return true;
    });
    const preFilteredCount = discoveredCount - candidateUrls.length;
    urls = opts.limit && !hasPostFilters ? candidateUrls.slice(0, opts.limit) : candidateUrls;
    log(
      opts,
      `  found ${urls.length} product pages${preFilteredCount ? ` (${preFilteredCount} pre-filtered)` : ""}`,
    );
    emit(opts, { type: "listing-complete", sourceId: id, count: urls.length });
    for (let i = 0; i < urls.length; i++) {
      throwIfAborted(signal);
      const url = urls[i];
      emit(opts, {
        type: "product-start",
        sourceId: id,
        index: i + 1,
        total: urls.length,
        url,
      });
      if (!opts.onProgress) process.stdout?.write(`\r  scraping ${i + 1}/${urls.length}…`);
      try {
        let rec: ScrapeRecord;
        const seeded = adapter.productFor ? await adapter.productFor(url) : undefined;
        if (seeded) {
          rec = seeded;
        } else {
          const html = await fetchHtml(url, fetchOpts);
          rec = adapter.parseProduct(url, html);
        }

        // Adapters may retain taxonomy learned during listing discovery.
        const taxonomy = adapter.taxonomyFor?.(url);
        if (taxonomy) {
          rec.categorySlug = taxonomy.category;
          rec.subCategorySlug = taxonomy.subCategory;
        } else {
          // Legacy fallback for adapters that return category URLs directly.
          const catMatch = url.match(/\/product_cat\/([^/?#]+)/);
          if (catMatch) {
            const tax = categoryFor(adapter.id, catMatch[1]);
            if (tax) {
              rec.categorySlug = tax.category;
              rec.subCategorySlug = tax.sub;
            }
          }
        }

        allRecords.push(rec);
        emit(opts, {
          type: "product-complete",
          sourceId: id,
          index: i + 1,
          total: urls.length,
          name: rec.name,
        });
      } catch (e) {
        if (signal?.aborted) throw e;
        errors.push({ url, message: String(e) });
        emit(opts, { type: "product-error", sourceId: id, url, message: String(e) });
      }
    }
    if (!opts.onProgress) process.stdout?.write("\n");
  }

  throwIfAborted(signal);
  const dateesRecords = allRecords.filter((record) => record.sourceId === "datees");
  if (opts.priceLookup !== false && dateesRecords.length) {
    const candidates = dateesRecords.filter((record) => record.price === null);
    try {
      const priceIndex = await fetchDateesShopPriceIndex(fetchOpts);
      let matched = 0;
      for (const record of candidates) {
        const quote = matchDateesShopPrice(record, priceIndex);
        if (!quote) continue;
        record.price = quote.price;
        if (quote.priceByColor) {
          record.priceByColor = { ...quote.priceByColor };
          record.colors = Object.keys(quote.priceByColor);
        }
        record.priceCurrency = quote.currency;
        record.priceFetchedAt = quote.fetchedAt;
        record.priceInStock = quote.inStock;
        record.priceSourceId = quote.sourceId;
        record.priceSourceUrl = quote.sourceUrl;
        matched += 1;
      }
      priceLookup = {
        sourceId: "dateesshop",
        sourceUrl: DATEES_SHOP_CATALOG_URL,
        matched,
        unmatched: candidates.length - matched,
      };
      log(opts, `  ✓ Datees Shop prices: ${matched}/${candidates.length} matched`);
    } catch (error) {
      priceLookup = {
        sourceId: "dateesshop",
        sourceUrl: DATEES_SHOP_CATALOG_URL,
        matched: 0,
        unmatched: candidates.length,
        error: String(error),
      };
      log(opts, `  ⚠ Datees Shop price lookup failed: ${String(error)}`);
    }
  }

  log(opts, `\n▶ refining & merging ${allRecords.length} records…`);
  emit(opts, { type: "refine-start", records: allRecords.length });
  const { products: mergedProducts, report: mergeReport } = refineAndMerge(allRecords);
  const filteredProducts = mergedProducts.filter((product) => {
    const reason = productFilterReason(product, filters);
    if (!reason) return true;
    filteredOut += 1;
    emit(opts, { type: "product-filtered", sourceId: product.sourceId, url: product.url, reason });
    return false;
  });
  const report = { ...mergeReport, kept: filteredProducts.length };
  const sortedProducts = sortProducts(filteredProducts, filters.sort);
  const limitedProducts = hasPostFilters && opts.limit
    ? sortedProducts.slice(0, opts.limit)
    : sortedProducts;
  emit(opts, {
    type: "refine-complete",
    kept: report.kept,
    merged: report.merged,
    conflicts: report.conflicts.length,
  });
  log(opts, `  ✓ ${report.kept} unique products (${report.merged} duplicates folded, ${report.conflicts.length} conflicts)`);
  if (limitedProducts.length < filteredProducts.length) log(opts, `  ℹ limit kept the first ${limitedProducts.length} sorted product(s)`);

  let outputProducts = limitedProducts;
  if (opts.downloadImages) {
    const imageDir = opts.imageDir ?? join(outDir, "images");
    const totalImages = limitedProducts.reduce((count, product) => count + product.imageUrls.length, 0);
    imagesTotal = totalImages;
    emit(opts, { type: "image-start", total: totalImages });
    log(opts, `\n▶ downloading ${totalImages} product image(s)…`);
    const imageResult = await downloadProductImages(limitedProducts, {
      imageDir,
      signal,
      fetchOpts,
      minIntervalMs: opts.imageMinIntervalMs,
      maxBytes: opts.imageMaxBytes,
      onProgress: (current, total, path, downloaded) => emit(opts, { type: "image-complete", current, total, downloaded, path }),
      onError: (url, message) => emit(opts, { type: "image-error", url, message }),
    });
    outputProducts = imageResult.products;
    imageErrors.push(...imageResult.errors);
    imagesDownloaded = imageResult.downloaded;
    log(opts, `  ✓ ${imageResult.downloaded}/${imageResult.total} image(s) downloaded`);
  }

  throwIfAborted(signal);
  // emit outputs
  mkdirSync(outDir, { recursive: true });
  const rawPath = join(outDir, "raw-scrape.json");
  const refinedPath = join(outDir, "catalog.fragment.json");
  const reportPath = join(outDir, "merge-report.json");

  writeFileSync(rawPath, JSON.stringify(allRecords, null, 2));
  writeFileSync(refinedPath, JSON.stringify(outputProducts.map(toCatalogShape), null, 2));
  writeFileSync(reportPath, JSON.stringify({ report, outputKept: outputProducts.length, errors, imageErrors, imagesDownloaded, imagesTotal, filteredOut, filters, priceLookup }, null, 2));

  log(opts, `\n  wrote:\n    ${rawPath}\n    ${refinedPath}\n    ${reportPath}`);
  if (errors.length) log(opts, `  ⚠ ${errors.length} page errors (see merge-report.json)`);
  if (imageErrors.length) log(opts, `  ⚠ ${imageErrors.length} image errors (remote fallbacks retained)`);
  if (filteredOut) log(opts, `  ℹ ${filteredOut} product page(s) excluded by scrape filters`);

  return { products: outputProducts, report, errors, imageErrors, imagesDownloaded, imagesTotal, filteredOut, priceLookup, outDir };
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function sourceOrigin(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : undefined;
  } catch {
    return undefined;
  }
}

/** Shape matching seed.ts CatalogProduct, with optional provenance fields. */
function toCatalogShape(p: RefinedProduct) {
  return {
    _id: p.model || p.slug, // seed uses this as Product.model / SKU identity
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    sourceId: p.sourceId,
    sourceUrl: sourceOrigin(p.url),
    sourcePageUrl: isHttpUrl(p.url) ? p.url : undefined,
    category: p.categorySlug || "oven",
    subCategory: p.subCategorySlug || "built-in",
    colors: p.colors,
    price: p.price ?? 0, // seed requires number; admin sets real price later
    ...(p.priceByColor ? { priceByColor: p.priceByColor } : {}),
    priceCurrency: p.priceCurrency,
    priceFetchedAt: p.priceFetchedAt,
    priceInStock: p.priceInStock,
    priceSourceId: p.priceSourceId,
    priceSourceUrl: p.priceSourceUrl,
    bestSeller: false,
    date: p.scrapedAt,
    image: p.localImageUrls?.length ? p.localImageUrls : p.imageUrls,
    ...(p.localImageUrls?.length ? { sourceImages: p.imageUrls } : {}),
    description: p.description,
    features: p.features,
    specs: p.specs,
  };
}
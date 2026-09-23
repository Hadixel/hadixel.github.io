// Orchestrator: crawl → scrape → refine/merge → emit catalog fragment.
// Each stage logs progress; failures on individual pages are collected, not fatal.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ScrapeRecord, RefinedProduct, MergeReport } from "./types.js";
import type { FetchOptions } from "./http.js";
import { fetchHtml } from "./http.js";
import { SOURCES, categoryFor } from "./sources.js";
import { refineAndMerge } from "./merge.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "out");

export type PipelineEvent =
  | { type: "source-start"; sourceId: string; brand: string }
  | { type: "listing-complete"; sourceId: string; count: number }
  | { type: "product-start"; sourceId: string; index: number; total: number; url: string }
  | { type: "product-complete"; sourceId: string; index: number; total: number; name: string }
  | { type: "product-error"; sourceId: string; url: string; message: string }
  | { type: "refine-start"; records: number }
  | { type: "refine-complete"; kept: number; merged: number; conflicts: number };

export interface PipelineOptions {
  sources?: string[]; // subset of adapter ids; default all
  limit?: number; // max products per source (smoke runs)
  fetchOpts?: FetchOptions;
  quiet?: boolean;
  signal?: AbortSignal;
  onProgress?: (event: PipelineEvent) => void;
}

export interface PipelineResult {
  products: RefinedProduct[];
  report: MergeReport;
  errors: { url: string; message: string }[];
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

export async function runPipeline(opts: PipelineOptions = {}): Promise<PipelineResult> {
  const sourceIds = opts.sources ?? Object.keys(SOURCES);
  const allRecords: ScrapeRecord[] = [];
  const errors: { url: string; message: string }[] = [];
  const signal = opts.signal ?? opts.fetchOpts?.signal;
  const fetchOpts = opts.signal
    ? { ...(opts.fetchOpts ?? {}), signal: opts.signal }
    : opts.fetchOpts;
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

    if (opts.limit) urls = urls.slice(0, opts.limit);
    log(opts, `  found ${urls.length} product pages`);
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
        const html = await fetchHtml(url, fetchOpts);
        const rec = adapter.parseProduct(url, html);

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
  log(opts, `\n▶ refining & merging ${allRecords.length} records…`);
  emit(opts, { type: "refine-start", records: allRecords.length });
  const { products, report } = refineAndMerge(allRecords);
  emit(opts, {
    type: "refine-complete",
    kept: report.kept,
    merged: report.merged,
    conflicts: report.conflicts.length,
  });
  log(opts, `  ✓ ${report.kept} unique products (${report.merged} duplicates folded, ${report.conflicts.length} conflicts)`);

  throwIfAborted(signal);
  // emit outputs
  mkdirSync(OUT_DIR, { recursive: true });
  const rawPath = join(OUT_DIR, "raw-scrape.json");
  const refinedPath = join(OUT_DIR, "catalog.fragment.json");
  const reportPath = join(OUT_DIR, "merge-report.json");

  writeFileSync(rawPath, JSON.stringify(allRecords, null, 2));
  writeFileSync(refinedPath, JSON.stringify(products.map(toCatalogShape), null, 2));
  writeFileSync(reportPath, JSON.stringify({ report, errors }, null, 2));

  log(opts, `\n  wrote:\n    ${rawPath}\n    ${refinedPath}\n    ${reportPath}`);
  if (errors.length) log(opts, `  ⚠ ${errors.length} page errors (see merge-report.json)`);

  return { products, report, errors, outDir: OUT_DIR };
}

/** Shape matching seed.ts CatalogProduct exactly (minus provenance). */
function toCatalogShape(p: RefinedProduct) {
  return {
    _id: p.model || p.slug, // seed uses this as Product.model / SKU identity
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    category: p.categorySlug || "oven",
    subCategory: p.subCategorySlug || "built-in",
    colors: p.colors,
    price: p.price ?? 0, // seed requires number; admin sets real price later
    bestSeller: false,
    date: p.scrapedAt,
    image: p.imageUrls, // remote URLs; db:images downloads locally pre-seed
    description: p.description,
    features: p.features,
    specs: p.specs,
  };
}
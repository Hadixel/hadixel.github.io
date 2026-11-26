// The price step, run after a scrape, on the products an operator chose.
//
// A scrape is content work: the manufacturer's page is read for what a product *is*. The price is
// not on those pages — datees.ir publishes none, and the shop that does is a different site with
// its own availability and per-colour pricing. Running the two together made every run wait on a
// second site and made a price look like something the scrape had found; keeping them apart means
// the catalogue snapshot is content-only, and a price is a decision an operator makes afterwards,
// for exactly the products they selected, from the live source.
//
// The shape mirrors the XLSX price list on purpose: both are an external source of prices applied
// to the review snapshot, both read `catalog.fragment.json` and are refused when the snapshot
// changed under the caller. What differs is where the number comes from — a workbook, or the
// Datees Shop API — and that a workbook is authoritative for every row it lists, while the API
// only answers for models it still sells.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { writeJsonAtomic } from "./price-list";
import {
  DATEES_SHOP_CATALOG_URL,
  fetchDateesShopPriceIndex,
  matchDateesShopPrice,
  type PriceQuote,
} from "./price-sources";
import type { FetchOptions } from "./http";
import type { ScrapeRecord } from "./types";

export interface DateesPriceFetchReport {
  sourceId: "dateesshop";
  sourceUrl: string;
  /** Slugs the operator asked for. */
  requested: number;
  /** Selected products the shop had a current price for. */
  matched: number;
  /** Selected products the shop listed nothing for — left price-less, never zeroed. */
  unmatched: number;
  /** Slugs that are no longer in the snapshot: the selection had gone stale. */
  skipped: number;
  error?: string;
  fetchedAt: number;
}

export interface FetchDateesPricesOptions {
  outDir: string;
  /** Product slugs to price; every other product is left exactly as it is. */
  slugs: string[];
  /** Optimistic hash of the snapshot, so a changed snapshot is refused rather than repriced. */
  expectedRevision?: string;
  /** HTTP options — the polite fetch layer, its disk cache and its cancellation. */
  fetchOpts?: FetchOptions;
}

type CatalogProduct = Record<string, unknown> & {
  slug: string;
  name: string;
  price: number;
  priceByColor?: Record<string, number>;
  priceCurrency?: string;
  priceFetchedAt?: number;
  priceInStock?: boolean;
  priceSourceId?: string;
  priceSourceUrl?: string;
  colors?: string[];
  specs: ScrapeRecord["specs"];
};

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT");
}

function parseJsonArray(body: string, filePath: string): Record<string, unknown>[] {
  const parsed: unknown = JSON.parse(body);
  if (!Array.isArray(parsed)) throw new Error(`Expected an array in ${filePath}`);
  return parsed.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"));
}

/**
 * The colours a quote prices, as the variant set that has to carry them.
 *
 * The shop's per-colour prices are keyed by *its* colour tokens, and a model can sell a finish
 * the page text never mentioned — so the product's variant set takes the quote's colours rather
 * than the quote being filtered down to the colours the text found. Colours the quote does not
 * price are kept: they were chosen during review, and dropping them would drop variants the
 * operator intended to import.
 */
function colorsWithQuote(colors: string[] | undefined, quote: PriceQuote): string[] | undefined {
  const priced = Object.keys(quote.priceByColor ?? {});
  if (!priced.length) return undefined;
  return [...new Set([...(colors ?? []), ...priced])];
}

/**
 * Fetch current Datees Shop prices for the selected products and write them into the snapshot.
 *
 * Only the selected slugs are rewritten. A product the operator did not tick keeps the price it
 * had — including no price — because an unticked product is one they have not decided about, and
 * a price arriving for it silently would make the selection meaningless. `raw-scrape.json` is
 * part of the revision hash but is never rewritten: the review snapshot is what import reads, and
 * the raw records stay the manufacturer's own words.
 */
export async function fetchDateesShopPrices(
  options: FetchDateesPricesOptions,
): Promise<DateesPriceFetchReport> {
  const outDir = resolve(options.outDir);
  const catalogPath = join(outDir, "catalog.fragment.json");
  const rawPath = join(outDir, "raw-scrape.json");

  const catalogBody = await readFile(catalogPath, "utf8");
  const catalog = parseJsonArray(catalogBody, catalogPath) as unknown as CatalogProduct[];
  let rawBody: Buffer;
  try {
    rawBody = await readFile(rawPath);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    rawBody = Buffer.alloc(0);
  }

  // The same hash the review list sends and the price list checks against — over both files, the
  // way the snapshot's revision is computed — so a caller holding a revision that no longer
  // describes the files is refused instead of writing a price onto a changed catalogue.
  const revision = createHash("sha256").update(Buffer.from(catalogBody, "utf8")).update(rawBody).digest("hex");
  if (options.expectedRevision && options.expectedRevision !== revision) {
    throw new Error("CATALOG_CHANGED");
  }

  const report: DateesPriceFetchReport = {
    sourceId: "dateesshop",
    sourceUrl: DATEES_SHOP_CATALOG_URL,
    requested: options.slugs.length,
    matched: 0,
    unmatched: 0,
    skipped: options.slugs.length,
    fetchedAt: Date.now(),
  };
  const wanted = new Set(options.slugs);
  if (!wanted.size) return report;

  const selected = catalog.filter((product) => wanted.has(product.slug));
  report.skipped = options.slugs.length - selected.length;
  if (!selected.length) return report;

  let index: Map<string, PriceQuote>;
  try {
    index = await fetchDateesShopPriceIndex(options.fetchOpts ?? {});
  } catch (error) {
    // The whole request fails the same way rather than half-applying: an operator told "12
    // matched" when the shop was never reached would be trusting a number nobody fetched.
    report.error = error instanceof Error ? error.message : String(error);
    report.unmatched = selected.length;
    return report;
  }
  report.fetchedAt = Date.now();

  const updated = catalog.map((product) => {
    if (!wanted.has(product.slug)) return product;
    // The same matching the scrape used to do inline, on the same fields: the record's name and
    // the spec sheet the adapter parsed, model first and name second.
    const quote = matchDateesShopPrice(
      { name: String(product.name ?? ""), specs: Array.isArray(product.specs) ? product.specs : [] },
      index,
    );
    if (!quote) {
      report.unmatched += 1;
      return product;
    }
    report.matched += 1;
    const colors = colorsWithQuote(
      Array.isArray(product.colors) ? product.colors.filter((color): color is string => typeof color === "string") : undefined,
      quote,
    );
    return {
      ...product,
      price: quote.price,
      ...(quote.priceByColor ? { priceByColor: { ...quote.priceByColor } } : {}),
      priceCurrency: quote.currency,
      priceFetchedAt: quote.fetchedAt,
      priceInStock: quote.inStock,
      priceSourceId: quote.sourceId,
      priceSourceUrl: quote.sourceUrl,
      ...(colors ? { colors } : {}),
    };
  });

  // A fetch that matched nothing changes nothing, so the file is left alone — and its revision
  // with it, so a preview the operator is holding stays valid.
  if (report.matched > 0) {
    await writeJsonAtomic(catalogPath, updated);
  }
  return report;
}

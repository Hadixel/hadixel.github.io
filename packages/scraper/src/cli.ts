#!/usr/bin/env npx tsx
// CLI entrypoint. Examples:
//   pnpm --filter @kmodern/scraper scrape                    # all sources
//   pnpm --filter @kmodern/scraper scrape --source datees     # one source
//   pnpm --filter @kmodern/scraper scrape --limit 5           # smoke run
//   pnpm --filter @kmodern/scraper scrape --images            # download product images
//   pnpm --filter @kmodern/scraper scrape --category oven --color black
//   SCRAPE_CACHE=1 pnpm … scrape                              # enable disk cache

import { runPipeline } from "./pipeline";
import type { ScrapeContentFilter, ScrapeFilters, ScrapePriceFilter, ScrapeSort } from "./types";

const args = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function optionalFlag(name: string): string | undefined {
  const value = flag(name)?.trim();
  return value && value !== "all" ? value : undefined;
}

function enumFlag<T extends string>(name: string, allowed: readonly (T | "all")[]): T | undefined {
  const value = optionalFlag(name);
  if (!value) return undefined;
  if (!allowed.includes(value as T | "all")) throw new Error(`Invalid --${name}: ${value}`);
  return value as T;
}

async function main() {
  const sources = flag("source")?.split(",").map((s) => s.trim());
  const limit = Number(flag("limit")) || undefined;
  const quiet = args.includes("--quiet");
  const downloadImages = args.includes("--images");
  const cacheDir = process.env.SCRAPE_CACHE ? ".scrape-cache" : undefined;
  const filters: ScrapeFilters = {
    search: optionalFlag("search"),
    manufacturer: optionalFlag("manufacturer"),
    website: optionalFlag("website"),
    category: optionalFlag("category"),
    subCategory: optionalFlag("subcategory") ?? optionalFlag("sub-category"),
    color: optionalFlag("color"),
    price: enumFlag<ScrapePriceFilter>("price", ["all", "priced", "missing"]),
    content: enumFlag<ScrapeContentFilter>("content", ["all", "with-images", "without-images", "with-specs"]),
    sort: enumFlag<ScrapeSort>("sort", ["all", "newest", "name", "price-high", "price-low"]),
  };

  const result = await runPipeline({
    sources,
    limit,
    quiet,
    downloadImages,
    filters,
    fetchOpts: { cacheDir },
  });

  if ((result.errors.length || result.imageErrors.length) && !quiet) {
    console.error(`\n${result.errors.length} page error(s), ${result.imageErrors.length} image error(s):`);
    for (const e of [...result.errors, ...result.imageErrors].slice(0, 10)) {
      console.error(`  ${e.url}: ${e.message}`);
    }
    const totalErrors = result.errors.length + result.imageErrors.length;
    if (totalErrors > 10) console.error(`  …and ${totalErrors - 10} more`);
  }

  process.exit(result.products.length === 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
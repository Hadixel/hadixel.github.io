// Scraped product contract. Output is a superset of seed.ts CatalogProduct:
// every CatalogProduct field plus provenance the refiner uses to merge
// duplicates across sources before emitting catalog.json.

export interface RawSpec {
  label: string;
  value: string;
}

export type ScrapePriceFilter = "all" | "priced" | "missing";
export type ScrapeContentFilter = "all" | "with-images" | "without-images" | "with-specs";
export type ScrapeSort = "newest" | "name" | "price-high" | "price-low";

export type ScrapeFilterValue = string | string[];

/** Filters applied before refinement; multi-value dimensions use OR within a dimension. */
export interface ScrapeFilters {
  search?: string;
  manufacturer?: ScrapeFilterValue;
  website?: ScrapeFilterValue;
  category?: ScrapeFilterValue;
  subCategory?: ScrapeFilterValue;
  color?: ScrapeFilterValue;
  price?: ScrapePriceFilter;
  content?: ScrapeContentFilter;
  sort?: ScrapeSort;
}

/** What a source adapter extracts from one product page — unrefined. */
export interface ScrapeRecord {
  sourceId: string; // adapter key, e.g. "datees"
  url: string; // canonical product URL (dedupe identity)
  name: string;
  brand: string;
  categorySlug: string; // Latin root category ("oven", "stove"…)
  subCategorySlug: string; // Latin child ("built-in", "double-bowl"…)
  colors: string[]; // Latin color tokens (seed COLOR_TOKENS)
  price: number | null; // TOMAN; null on manufacturer sites
  priceByColor?: Record<string, number>; // current Toman price per color variant
  priceCurrency?: "TOMAN";
  priceFetchedAt?: number;
  priceInStock?: boolean;
  priceSourceId?: string; // optional price enrichment provenance
  priceSourceUrl?: string;
  imageUrls: string[]; // absolute remote URLs
  description: string;
  features: string[];
  specs: RawSpec[];
  scrapedAt: number; // epoch ms
}

/** Refined record: normalized Persian text + derived model code. */
export interface RefinedProduct extends ScrapeRecord {
  slug: string; // Latin URL slug, unique per (brand, model)
  model: string; // extracted model code, e.g. "TFT669", "DG-586"
  localImageUrls?: string[]; // populated when image downloading is enabled
}

/** Merge verdict when two records describe the same physical product. */
export interface MergeReport {
  kept: number;
  merged: number; // records folded into another
  conflicts: Conflict[];
}

export interface PriceLookupReport {
  sourceId: string;
  sourceUrl: string;
  matched: number;
  unmatched: number;
  error?: string;
}

export interface Conflict {
  slug: string;
  field: string;
  winner: string; // sourceId that won
  loser: string;
  detail?: string;
}
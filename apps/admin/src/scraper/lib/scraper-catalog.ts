import { SCRAPE_SUB_LABELS, SUB_LABELS } from "@/scraper/lib/scraper-labels";
import type { ScraperCatalogItem } from "@/scraper/lib/scraper-types";

/**
 * Everything the review table knows how to do to a catalogue, as pure functions. The panel used to
 * carry these inline in five `useMemo` bodies; as free functions they are testable without React
 * and the hook shrinks to the memo calls that bind them to state.
 */

export type PriceFilter = "all" | "priced" | "missing";
export type ContentFilter = "all" | "with-images" | "without-images" | "with-specs";
export type SortOrder = "newest" | "name" | "price-high" | "price-low";
export type ScrapeSortFilter = "all" | SortOrder;

/**
 * Availability, as the price step records it.
 *
 * Three answers rather than two, because the catalogue really has three: the shop said this ships,
 * the shop said it does not, and the shop has not been asked yet. A scrape carries no price and
 * therefore no availability, so every product of a fresh run is `unspecified` until the operator
 * runs the price step — folding that into `available` would report 107 products as in stock when 73
 * are, and folding it into `unavailable` would report 82 as sold out when 48 are. `unspecified` is
 * the queue of products whose stock question is still open, which is the thing worth filtering for.
 */
export type StockFilter = "all" | "available" | "unavailable" | "unspecified";

export interface CatalogReviewFilters {
  query: string;
  manufacturer: string;
  website: string;
  /** Root categories, OR'd. Empty means "all of them", matching the multi-select's own "همه". */
  root: string[];
  /** Sub-categories, OR'd across the chosen roots. Empty means all of them. */
  sub: string[];
  color: string;
  price: PriceFilter;
  stock: StockFilter;
  content: ContentFilter;
  sort: SortOrder;
}

/** The stable identity of a product's source site: its hostname, or the adapter id behind it. */
export function websiteKey(item: ScraperCatalogItem): string {
  if (item.sourceUrl) {
    try {
      return new URL(item.sourceUrl).hostname.toLocaleLowerCase("en");
    } catch {
      // Fall through to the stable adapter id.
    }
  }
  return item.sourceId?.toLocaleLowerCase("en") || "unknown";
}

export function websiteLabel(item: ScraperCatalogItem): string {
  if (item.sourceUrl) {
    try {
      return new URL(item.sourceUrl).hostname;
    } catch {
      // Fall through to the adapter id.
    }
  }
  return item.sourceId || "نامشخص";
}

export function catalogSubcategoryOptions(items: ScraperCatalogItem[], rootFilter: string[]): string[] {
  const values = items
    .filter((item) => !rootFilter.length || rootFilter.includes(item.category))
    .map((item) => item.subCategory);
  return [...new Set(values)].sort((a, b) => (SUB_LABELS[a] ?? a).localeCompare(SUB_LABELS[b] ?? b, "fa"));
}

export function catalogBrandOptions(items: ScraperCatalogItem[]): string[] {
  return [...new Set(items.map((item) => item.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fa"));
}

export function catalogWebsiteOptions(items: ScraperCatalogItem[]): Array<[string, string]> {
  const labels = new Map<string, string>();
  for (const item of items) {
    const key = websiteKey(item);
    if (!labels.has(key)) labels.set(key, websiteLabel(item));
  }
  return [...labels.entries()].sort((a, b) => a[1].localeCompare(b[1], "fa"));
}

/**
 * The sub-categories a scrape may name. An empty selection means "no category chosen", which the
 * panel offers as every category there is rather than as none.
 */
export function availableScrapeSubcategories(selectedCategories: string[]): string[] {
  const categories = selectedCategories.length ? selectedCategories : Object.keys(SCRAPE_SUB_LABELS);
  return [...new Set(categories.flatMap((category) => SCRAPE_SUB_LABELS[category] ?? []))];
}

export function filterCatalog(items: ScraperCatalogItem[], filters: CatalogReviewFilters): ScraperCatalogItem[] {
  const normalizedQuery = filters.query.trim().toLocaleLowerCase("fa");
  const filtered = items.filter((item) => {
    const searchable = [item.name, item.brand, item.sourceId, item.sourceUrl, item._id, item.slug, item.description]
      .join(" ")
      .toLocaleLowerCase("fa");
    if (normalizedQuery && !searchable.includes(normalizedQuery)) return false;
    if (filters.manufacturer !== "all" && item.brand !== filters.manufacturer) return false;
    if (filters.website !== "all" && websiteKey(item) !== filters.website) return false;
    // Several categories at once, OR'd within the dimension — the same rule the scrape filters
    // use, because an operator narrowing a 155-product list to "ovens and hoods" is asking for the
    // union, not the intersection of two appliance families.
    if (filters.root.length && !filters.root.includes(item.category)) return false;
    if (filters.sub.length && !filters.sub.includes(item.subCategory)) return false;
    if (filters.color !== "all" && !item.colors.includes(filters.color)) return false;
    if (filters.price === "priced" && item.price <= 0) return false;
    if (filters.price === "missing" && item.price > 0) return false;
    if (filters.stock === "available" && item.priceInStock !== true) return false;
    if (filters.stock === "unavailable" && item.priceInStock !== false) return false;
    if (filters.stock === "unspecified" && item.priceInStock !== undefined) return false;
    if (filters.content === "with-images" && item.image.length === 0) return false;
    if (filters.content === "without-images" && item.image.length > 0) return false;
    if (filters.content === "with-specs" && item.specs.length === 0) return false;
    return true;
  });

  return filtered.sort((a, b) => {
    if (filters.sort === "name") return a.name.localeCompare(b.name, "fa");
    if (filters.sort === "price-high") return b.price - a.price;
    if (filters.sort === "price-low") return a.price - b.price;
    return b.date - a.date;
  });
}

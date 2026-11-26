// The review list's filters, and the availability one in particular.
//
// Availability is the only dimension whose values are a *statement about the world* rather than a
// property of the scraped row: the shop said this ships, said it does not, or was never asked. A
// scrape carries no price and so no availability, which means every product of a fresh run sits in
// the third state until the operator runs the price step — so a two-state filter here would
// quietly misreport a just-scraped catalogue. These tests pin the three states apart.

import { describe, expect, it } from "vitest";
import { catalogSubcategoryOptions, filterCatalog, type CatalogReviewFilters, type StockFilter } from "@/scraper/lib/scraper-catalog";
import type { ScraperCatalogItem } from "@/scraper/lib/scraper-types";

function item(slug: string, overrides: Partial<ScraperCatalogItem> = {}): ScraperCatalogItem {
  return {
    _id: slug,
    slug,
    name: `محصول ${slug}`,
    brand: "Datees",
    category: "stove",
    subCategory: "built-in",
    colors: ["steel"],
    price: 10_000_000,
    bestSeller: false,
    date: 1,
    image: [],
    description: "",
    features: [],
    specs: [],
    ...overrides,
  };
}

const AVAILABLE = item("in-stock", { priceInStock: true });
const SOLD_OUT = item("sold-out", { priceInStock: false });
const UNPRICED = item("unpriced", { price: 0 });
const LIST = [AVAILABLE, SOLD_OUT, UNPRICED];

function filters(overrides: Partial<CatalogReviewFilters> = {}): CatalogReviewFilters {
  return {
    query: "",
    manufacturer: "all",
    website: "all",
    root: [],
    sub: [],
    color: "all",
    price: "all",
    stock: "all",
    content: "all",
    sort: "newest",
    ...overrides,
  };
}

function slugs(stock: StockFilter): string[] {
  return filterCatalog(LIST, filters({ stock })).map((entry) => entry.slug);
}

describe("filtering the review list by availability", () => {
  it("keeps only the products the shop said it ships", () => {
    expect(slugs("available")).toEqual(["in-stock"]);
  });

  it("keeps only the products the shop said it cannot ship", () => {
    expect(slugs("unavailable")).toEqual(["sold-out"]);
  });

  it("keeps the products whose availability nobody has stated yet", () => {
    // A scrape carries no price and therefore no availability, so this is the state a fresh run is
    // entirely in — and filtering for it is how an operator finds what still needs a price step.
    expect(slugs("unspecified")).toEqual(["unpriced"]);
  });

  it("does not answer a state the row does not carry", () => {
    // `priceInStock` is optional and absent means "not stated". Treating a missing value as
    // availability would let a filter report stock nobody ever checked.
    expect(slugs("available")).not.toContain("unpriced");
    expect(slugs("unavailable")).not.toContain("unpriced");
  });

  it("leaves every row alone by default", () => {
    expect(slugs("all")).toHaveLength(3);
  });

  it("combines with the other dimensions", () => {
    const filtered = filterCatalog(
      [AVAILABLE, SOLD_OUT, item("in-stock-oven", { priceInStock: true, category: "oven" })],
      filters({ stock: "available", root: ["oven"] }),
    );
    expect(filtered.map((entry) => entry.slug)).toEqual(["in-stock-oven"]);
  });
});

describe("filtering the review list by several categories at once", () => {
  const oven = item("oven", { category: "oven", subCategory: "built-in" });
  const hood = item("hood", { category: "hood", subCategory: "chimney" });
  const sink = item("sink", { category: "sink", subCategory: "steel" });
  const ALL = [oven, hood, sink];

  it("takes the union of the chosen categories, not their intersection", () => {
    // An operator narrowing a 155-product list to "ovens and hoods" is asking for both families;
    // intersecting them would return nothing, which is never what anybody means.
    expect(filterCatalog(ALL, filters({ root: ["oven", "hood"] })).map((p) => p.slug))
      .toEqual(["oven", "hood"]);
  });

  it("treats an empty selection as every category", () => {
    expect(filterCatalog(ALL, filters({ root: [], sub: [] }))).toHaveLength(3);
  });

  it("filters sub-categories across the chosen roots", () => {
    const kettle = item("kettle", { category: "kettle", subCategory: "electric" });
    expect(
      filterCatalog([...ALL, kettle], filters({ sub: ["electric", "steel"] })).map((p) => p.slug),
    ).toEqual(["sink", "kettle"]);
  });

  it("narrows the sub-category list to the chosen roots", () => {
    expect(catalogSubcategoryOptions(ALL, ["oven"])).toEqual(["built-in"]);
    // Ordered by the Persian label the operator reads, which is the point of the list.
    expect(catalogSubcategoryOptions(ALL, [])).toEqual(["steel", "built-in", "chimney"]);
  });
});

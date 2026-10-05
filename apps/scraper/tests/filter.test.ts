import { describe, expect, it } from "vitest";
import { matchesScrapeFilters, type ScrapeFilters, type ScrapeRecord } from "@kmodern/scraper-core";

const record: ScrapeRecord = {
  sourceId: "datees",
  url: "https://datees.ir/product/dg-587",
  name: "اجاق گاز داتیس مدل DG-587",
  brand: "Datees",
  categorySlug: "stove",
  subCategorySlug: "freestanding",
  colors: ["black", "steel"],
  price: 100,
  imageUrls: ["https://datees.ir/uploads/dg-587.webp"],
  description: "توضیحات",
  features: ["ویژگی"],
  specs: [{ label: "مدل", value: "DG-587" }],
  scrapedAt: 1,
};

describe("multi-value scraper filters", () => {
  it("uses OR within a dimension", () => {
    const filters: ScrapeFilters = {
      category: ["oven", "stove"],
      color: ["white", "black"],
    };
    expect(matchesScrapeFilters(record, filters)).toBe(true);
    expect(matchesScrapeFilters(record, { category: ["sink", "hood"] })).toBe(false);
  });

  it("keeps different dimensions combined with AND", () => {
    expect(matchesScrapeFilters(record, {
      category: ["oven", "stove"],
      subCategory: ["built-in", "freestanding"],
      color: ["black", "steel"],
    })).toBe(true);
    expect(matchesScrapeFilters(record, {
      category: ["oven", "stove"],
      color: ["white", "silver"],
    })).toBe(false);
  });

  it("accepts legacy string filter values", () => {
    expect(matchesScrapeFilters(record, { category: "stove", color: "black" })).toBe(true);
  });
});

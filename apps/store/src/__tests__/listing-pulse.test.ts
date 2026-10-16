import { describe, expect, it } from "vitest";

import { listingPulse } from "@/catalogue/components/listing-pulse";
import type { CategorySummary } from "@/types";

const cats = [
  { id: "r1", name: "فر", slug: "oven", parentId: null },
  { id: "c1", name: "شیشه‌ای", slug: "oven-glass", parentId: "r1" },
  { id: "r2", name: "هود", slug: "hood", parentId: null },
] as CategorySummary[];

const base = () => ({ count: 1, categories: cats, action: "/products" });

describe("listing pulse", () => {
  it("reports the product count verbatim", () => {
    const pulse = listingPulse({ ...base(), count: 24 });
    expect(pulse.count).toBe(24);
  });

  it("produces no chips when no filter is active (allActive true)", () => {
    const pulse = listingPulse({ ...base() });
    expect(pulse.chips).toEqual([]);
    expect(pulse.allActive).toBe(true);
  });

  it("exposes chips for an active category and a query", () => {
    const pulse = listingPulse({
      ...base(),
      activeSlug: "oven-glass",
      query: "فر",
      sort: "price-asc",
    });

    expect(pulse.chips).toHaveLength(2);
    const [categoryChip, queryChip] = pulse.chips;
    expect(categoryChip).toMatchObject({
      key: "category",
      label: "شیشه‌ای",
      active: true,
      removable: true,
    });
    expect(queryChip).toMatchObject({ key: "query", label: "«فر»", active: true, removable: true });

    // chips reflect the active state and stay removable
    expect(pulse.allActive).toBe(false);

    // top chips mark the root ancestor as active even though a descendant is selected
    const hood = pulse.tops.find((c) => c.slug === "oven");
    expect(hood?.active).toBe(true);

    // count is unchanged by filters
  });

  it("preserves sort and q on sort links; omits the default", () => {
    const pulse = listingPulse({
      ...base(),
      query: "فر",
      sort: "price-asc",
    });

    const newest = pulse.sorts.find((s) => s.value === "newest")!;
    const asc = pulse.sorts.find((s) => s.value === "price-asc")!;
    expect(asc.active).toBe(true);
    expect(asc.href).toContain("sort=price-asc");
    expect(asc.href).toContain("q=");
    expect(newest.active).toBe(false);
    expect(newest.href).toBe("/products?q=%D9%81%D8%B1");
  });

  it("sorts top roots with sort carried and ten-at-most", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`,
      name: `رده ${i}`,
      slug: `r-${i}`,
      parentId: null,
    })) as CategorySummary[];
    const pulse = listingPulse({
      count: 2,
      categories: many,
      sort: "price-desc",
      action: "/products",
    });
    expect(pulse.tops).toHaveLength(10);
    expect(pulse.tops[0].href).toBe("/category/r-0?sort=price-desc");
    expect(pulse.tops[0].active).toBe(false);
  });

  it("clearing category keeps q and sort, clearing query keeps sort", () => {
    const pulse = listingPulse({
      ...base(),
      activeSlug: "oven",
      query: "فر",
      sort: "price-desc",
    });
    const categoryChip = pulse.chips.find((c) => c.key === "category")!;
    const queryChip = pulse.chips.find((c) => c.key === "query")!;
    expect(categoryChip.href).toBe("/products?q=%D9%81%D8%B1&sort=price-desc");
    expect(queryChip.href).toBe("/products?sort=price-desc");
  });
});

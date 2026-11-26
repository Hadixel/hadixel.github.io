// The second step: prices, fetched for the products an operator selected, and nothing else.
//
// It runs against `fetchDateesShopPrices` — the real entry point — with the shop's payload seeded
// into a disk cache, the same way the price-sources suite seeds its endpoints. What is asserted is
// the selection contract, not the fetch: which products the write touches, what a product with no
// quote keeps, and that a snapshot which changed under the caller is refused rather than
// repriced. A scrape no longer carries a price, so this step is the only way a fetched one
// arrives — if it wrote to a product the operator had not ticked, the tick would mean nothing.

import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATEES_SHOP_CATALOG_URL, DATEES_SHOP_PRODUCTS_URL, fetchDateesShopPrices } from "@kmodern/scraper-core";

function product(name: string, slug: string, variants: Array<{ price: number; inventory: number; color: string }>, extra: Record<string, unknown> = {}) {
  return {
    product_name: name,
    product_slug: slug,
    variants: variants.map((v) => ({ price: v.price, inventory: v.inventory, attributes: [{ name: "رنگ", value: v.color }] })),
    ...extra,
  };
}

const payload = {
  success: true,
  data: {
    products: [
      product("اجاق گاز شیشه ای داتیس مدل DG-596", "dg-596", [
        { price: 18_500_000, inventory: 4, color: "مشکی" },
        { price: 19_200_000, inventory: 2, color: "استیل" },
      ]),
      product("هود داتیس مدل HD-700", "hd-700", [{ price: 12_000_000, inventory: 3, color: "استیل" }]),
    ],
  },
};

let cacheDir = "";
let outDir = "";

/** A catalog fragment as the scrape writes one: content, no price, images and specs intact. */
function fragment() {
  return [
    {
      _id: "DG-596",
      slug: "datees-dg-596",
      name: "اجاق گاز شیشه ای داتیس مدل DG-596",
      brand: "Datees",
      category: "stove",
      subCategory: "glass",
      colors: ["black"],
      price: 0,
      image: ["/tmp/images/datees-dg-596/img-1.jpg"],
      sourceImages: ["https://datees.ir/uploads/596.jpg"],
      description: "یک اجاق گاز شیشه‌ای",
      features: ["نمایشگر TFT"],
      specs: [{ label: "مدل", value: "DG-596" }],
    },
    {
      _id: "HD-700",
      slug: "datees-hd-700",
      name: "هود داتیس مدل HD-700",
      brand: "Datees",
      category: "hood",
      subCategory: "chimney",
      colors: ["steel"],
      price: 0,
      image: ["/tmp/images/datees-hd-700/img-1.jpg"],
      sourceImages: ["https://datees.ir/uploads/hood700.jpg"],
      description: "یک هود",
      features: [],
      specs: [{ label: "مدل", value: "HD-700" }],
    },
    {
      _id: "DF-660",
      slug: "datees-df-660",
      name: "فر توکار داتیس مدل DF-660",
      brand: "Datees",
      category: "oven",
      subCategory: "built-in",
      colors: ["steel"],
      price: 0,
      image: ["/tmp/images/datees-df-660/img-1.jpg"],
      sourceImages: ["https://datees.ir/uploads/df660.jpg"],
      description: "یک فر توکار",
      features: [],
      specs: [{ label: "مدل", value: "DF-660" }],
    },
  ];
}

/** The revision hash the panel computes over both snapshot files, over the bytes on disk. */
function revision(): string {
  return createHash("sha256")
    .update(readFileSync(join(outDir, "catalog.fragment.json")))
    .update(readFileSync(join(outDir, "raw-scrape.json")))
    .digest("hex");
}

async function readFragment() {
  return JSON.parse(readFileSync(join(outDir, "catalog.fragment.json"), "utf8")) as Record<string, unknown>[];
}

function bySlug(products: Record<string, unknown>[], slug: string) {
  const found = products.find((product) => product.slug === slug);
  if (!found) throw new Error(`no product ${slug}`);
  return found;
}

function writeSnapshot(products: unknown[]) {
  writeFileSync(join(outDir, "catalog.fragment.json"), JSON.stringify(products, null, 2));
  writeFileSync(join(outDir, "raw-scrape.json"), JSON.stringify(products, null, 2));
}

beforeAll(() => {
  cacheDir = mkdtempSync(join(tmpdir(), "price-fetch-cache-"));
  outDir = mkdtempSync(join(tmpdir(), "price-fetch-out-"));
  for (const url of [DATEES_SHOP_CATALOG_URL, DATEES_SHOP_PRODUCTS_URL]) {
    const dir = join(cacheDir, new URL(url).host);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, createHash("sha256").update(url).digest("hex").slice(0, 32) + ".html"), JSON.stringify(payload));
  }
  writeSnapshot(fragment());
});

afterAll(() => {
  rmSync(cacheDir, { recursive: true, force: true });
  rmSync(outDir, { recursive: true, force: true });
});

describe("fetching prices for the selected products", () => {
  it("prices the ticked products and leaves the others exactly as they were", async () => {
    const report = await fetchDateesShopPrices({
      outDir,
      slugs: ["datees-dg-596"],
      fetchOpts: { cacheDir },
    });

    expect(report.matched).toBe(1);
    expect(report.requested).toBe(1);
    expect(report.unmatched).toBe(0);

    const products = await readFragment();
    const selected = bySlug(products, "datees-dg-596");
    const unticked = bySlug(products, "datees-hd-700");
    const absent = bySlug(products, "datees-df-660");

    expect(selected.price).toBe(18_500_000);
    expect(selected.priceByColor).toEqual({ black: 18_500_000, steel: 19_200_000 });
    expect(selected.priceSourceId).toBe("dateesshop");
    expect(selected.priceCurrency).toBe("TOMAN");
    expect(typeof selected.priceFetchedAt).toBe("number");
    // The shop's per-colour prices name the colours the model actually sells, and a variant has to
    // exist to carry them — including a finish the page text never mentioned.
    expect(selected.colors).toEqual(["black", "steel"]);
    // Content is untouched by a price.
    expect(selected.name).toBe("اجاق گاز شیشه ای داتیس مدل DG-596");
    expect(selected.specs).toEqual([{ label: "مدل", value: "DG-596" }]);
    expect(selected.image).toEqual(["/tmp/images/datees-dg-596/img-1.jpg"]);
    expect(selected.sourceImages).toEqual(["https://datees.ir/uploads/596.jpg"]);

    expect(unticked.price).toBe(0);
    expect(unticked).not.toHaveProperty("priceByColor");
    expect(absent.price).toBe(0);
  });

  it("leaves a selected product with no quote price-less rather than zero-priced", async () => {
    writeSnapshot(fragment());
    const report = await fetchDateesShopPrices({
      outDir,
      slugs: ["datees-df-660"],
      fetchOpts: { cacheDir },
    });

    expect(report.matched).toBe(0);
    expect(report.unmatched).toBe(1);
    const products = await readFragment();
    expect(bySlug(products, "datees-df-660").price).toBe(0);
    // A fetch that matched nothing writes nothing, so the revision the panel holds stays valid.
    expect(revision()).toBe(createHash("sha256")
      .update(readFileSync(join(outDir, "catalog.fragment.json")))
      .update(readFileSync(join(outDir, "raw-scrape.json")))
      .digest("hex"));
  });

  it("counts a slug the snapshot no longer has instead of failing the whole fetch", async () => {
    writeSnapshot(fragment());
    const report = await fetchDateesShopPrices({
      outDir,
      slugs: ["datees-dg-596", "datees-gone"],
      fetchOpts: { cacheDir },
    });

    expect(report.matched).toBe(1);
    expect(report.skipped).toBe(1);
  });

  it("refuses a snapshot that changed after the caller read it", async () => {
    writeSnapshot(fragment());
    await expect(
      fetchDateesShopPrices({
        outDir,
        slugs: ["datees-dg-596"],
        expectedRevision: "0".repeat(64),
        fetchOpts: { cacheDir },
      }),
    ).rejects.toThrow("CATALOG_CHANGED");

    expect((await readFragment()).every((product) => product.price === 0)).toBe(true);
  });

  it("does nothing at all when nothing is selected", async () => {
    writeSnapshot(fragment());
    const report = await fetchDateesShopPrices({ outDir, slugs: [], fetchOpts: { cacheDir } });
    expect(report).toMatchObject({ requested: 0, matched: 0, unmatched: 0, skipped: 0 });
    expect((await readFragment()).every((product) => product.price === 0)).toBe(true);
  });
});

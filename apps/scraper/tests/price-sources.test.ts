// The Datees Shop price index, and the availability rule it now carries.
//
// This is the source of the number the price watch offers an operator, so what it refuses to quote
// is as much a contract as what it quotes: a sold-out model still has a price on its page, and that
// number reaching the queue means an operator asked to reprice this shop against a product Datees
// will not ship.
//
// It runs against `fetchDateesShopPriceIndex` — the real entry point, not an exported helper — with
// both URLs seeded into a disk cache. `fetchHtml` reads a fresh cache file before it does any DNS or
// transport work, so the payload below is the whole environment: no network, no mocking of the
// module under test, and a test that fails if the *selection* logic moves rather than only if a
// helper it calls does.

import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DATEES_SHOP_CATALOG_URL,
  DATEES_SHOP_PRODUCTS_URL,
  fetchDateesShopPriceIndex,
  type PriceQuote,
} from "@kmodern/scraper-core/price-sources";

/** One Datees Shop product, in the shape `readProductPayload` expects. */
function product(
  name: string,
  slug: string,
  variants: Array<{ price: number; inventory: number; color: string }>,
  extra: Record<string, unknown> = {},
) {
  return {
    product_name: name,
    product_slug: slug,
    variants: variants.map((v) => ({
      price: v.price,
      inventory: v.inventory,
      attributes: [{ name: "رنگ", value: v.color }],
    })),
    ...extra,
  };
}

const payload = {
  success: true,
  data: {
    products: [
      // In stock, so it must be quoted.
      product("اجاق گاز داتیس مدل DF-900", "اجاق-گاز-داتیس-مدل-df900", [
        { price: 10_000_000, inventory: 5, color: "مشکی" },
      ]),
      // Every variant dead, and no product-level price: there is nothing here to quote at all.
      product("اجاق گاز داتیس مدل DF-901", "اجاق-گاز-داتیس-مدل-df901", [
        { price: 12_000_000, inventory: 0, color: "مشکی" },
      ]),
      // Every variant dead, but the shop still lists a price at the product level — the case that
      // makes the quote exist while availability says `false`.
      product("اجاق گاز داتیس مدل DF-902", "اجاق-گاز-داتیس-مدل-df902", [
        { price: 7_000_000, inventory: 0, color: "مشکی" },
      ], { price: 7_000_000, min_price: 7_000_000 }),
      // One colour dead, one stocked: the cheapest price is the dead one, so a minimum taken over
      // every variant would quote the colour nobody can have.
      product("اجاق گاز داتیس مدل DF-903", "اجاق-گاز-داتیس-مدل-df903", [
        { price: 9_000_000, inventory: 0, color: "مشکی" },
        { price: 15_000_000, inventory: 2, color: "سفید" },
      ]),
    ],
  },
};

let cacheDir = "";

beforeAll(() => {
  cacheDir = mkdtempSync(join(tmpdir(), "price-sources-test-"));
  // Both endpoints, keyed exactly as `fetchHtml` keys them: `sha256(url)[0..32] + ".html"`, under
  // a directory named for the URL's host.
  for (const url of [DATEES_SHOP_CATALOG_URL, DATEES_SHOP_PRODUCTS_URL]) {
    const dir = join(cacheDir, new URL(url).host);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, createHash("sha256").update(url).digest("hex").slice(0, 32) + ".html");
    writeFileSync(file, JSON.stringify(payload), "utf8");
  }
});

afterAll(() => {
  rmSync(cacheDir, { recursive: true, force: true });
});

/** The quote for one product, by the name the source quoted it under. */
async function quotesByName(): Promise<Map<string, PriceQuote[]>> {
  const index = await fetchDateesShopPriceIndex({ cacheDir });
  const byName = new Map<string, PriceQuote[]>();
  for (const quote of index.values()) {
    const existing = byName.get(quote.productName) ?? [];
    existing.push(quote);
    byName.set(quote.productName, existing);
  }
  return byName;
}

describe("quoting only what the shop can ship", () => {
  it("quotes an in-stock product", async () => {
    const byName = await quotesByName();
    const live = byName.get("اجاق گاز داتیس مدل DF-900");
    expect(live).toBeDefined();
    expect(live![0].price).toBe(10_000_000);
    expect(live![0].inStock).toBe(true);
  });

  it("never enters a product whose variants are all out of stock", async () => {
    const byName = await quotesByName();
    expect(byName.has("اجاق گاز داتیس مدل DF-901")).toBe(false);
  });

  // The quote exists because the shop lists a product-level price — but availability is an explicit
  // `false`, not an absence. That distinction is what the watcher's `inStock === false` guard reads.
  it("marks a product-level price for a sold-out product as out of stock", async () => {
    const byName = await quotesByName();
    const dead = byName.get("اجاق گاز داتیس مدل DF-902");
    expect(dead).toBeDefined();
    expect(dead![0].inStock).toBe(false);
  });

  it("prices a partially stocked product from the stocked colour only", async () => {
    const byName = await quotesByName();
    const partial = byName.get("اجاق گاز داتیس مدل DF-903");
    expect(partial).toBeDefined();
    const quote = partial![0];

    expect(quote.inStock).toBe(true);
    // The dead colour is cheaper, so a minimum over every variant would have picked it.
    expect(quote.price).toBe(15_000_000);
    expect(quote.priceByColor?.white).toBe(15_000_000);
    expect(quote.priceByColor?.black).toBeUndefined();
  });
});

import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as XLSXModule from "xlsx";
import { describe, expect, it } from "vitest";
import { applyPriceList, applyPriceListReportToProducts } from "../src/price-list";

const XLSX = (XLSXModule as typeof XLSXModule & { default?: typeof XLSXModule }).default ?? XLSXModule;

/*
 * Seam: applyPriceList is the public file-to-review-snapshot interface. These
 * tests pin the safety rules an owner relies on when replacing a price list.
 */
async function fixture() {
  const outDir = await mkdtemp(join(tmpdir(), "kmodern-price-list-"));
  const catalog = [{
    _id: "DG-587",
    slug: "datees-dg-587",
    name: "اجاق گاز داتیس مدل DG-587",
    brand: "Datees",
    sourceId: "datees",
    category: "stove",
    subCategory: "freestanding",
    colors: ["black"],
    price: 100,
    priceByColor: { black: 100 },
    priceCurrency: "TOMAN",
    priceSourceId: "dateesshop",
    priceInStock: false,
    image: [],
    features: [],
    specs: [{ label: "نام مدل", value: "DG-587" }],
  }];
  const raw = [{
    sourceId: "datees",
    url: "https://datees.ir/product/dg-587",
    name: "اجاق گاز داتیس مدل DG-587",
    brand: "Datees",
    categorySlug: "stove",
    subCategorySlug: "freestanding",
    colors: ["black"],
    price: null,
    imageUrls: [],
    description: "",
    features: [],
    specs: [{ label: "نام مدل", value: "DG-587" }],
    scrapedAt: 1,
  }];
  await writeFile(join(outDir, "catalog.fragment.json"), JSON.stringify(catalog));
  await writeFile(join(outDir, "raw-scrape.json"), JSON.stringify(raw));
  return { outDir, catalogPath: join(outDir, "catalog.fragment.json") };
}

async function workbook(path: string, rows: Array<[string, number]>, header = ["model", "consumer_price_toman"]): Promise<void> {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  XLSX.utils.book_append_sheet(book, sheet, "Prices");
  XLSX.writeFile(book, path);
}

describe("price-list application", () => {
  it("matches a normalized model, replaces stale price metadata, and is idempotent", async () => {
    const { outDir, catalogPath } = await fixture();
    const filePath = join(outDir, "prices.xlsx");
    await workbook(filePath, [["DG 587", 72523000]]);

    const first = await applyPriceList({ filePath, outDir, brand: "Datees" });
    expect(first.matchedCatalog).toBe(1);
    expect(first.updates[0]?.changed).toBe(true);
    const updated = JSON.parse(await readFile(catalogPath, "utf8"));
    expect(updated[0]).toMatchObject({
      price: 72523000,
      priceCurrency: "TOMAN",
      priceSourceId: "xlsx:prices.xlsx",
    });
    expect(updated[0].priceByColor).toBeUndefined();
    expect(updated[0].priceInStock).toBeUndefined();
    const inMemory = applyPriceListReportToProducts([{
      slug: "datees-dg-587",
      price: 100,
      priceByColor: { black: 100 },
      priceInStock: false,
    }], first);
    expect(inMemory[0]).toMatchObject({ price: 72523000, priceSourceId: "xlsx:prices.xlsx" });
    expect(inMemory[0].priceByColor).toBeUndefined();

    const second = await applyPriceList({ filePath, outDir, brand: "Datees" });
    expect(second.updates[0]?.changed).toBe(false);
  });

  it("reports identical duplicate rows without applying either row", async () => {
    const { outDir, catalogPath } = await fixture();
    const filePath = join(outDir, "duplicate.xlsx");
    await workbook(filePath, [["DG-587", 72523000], ["DG 587", 72523000]]);

    const report = await applyPriceList({ filePath, outDir, brand: "Datees" });
    expect(report.duplicate).toBe(1);
    expect(report.matchedCatalog).toBe(0);
    expect(report.updates).toHaveLength(0);
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    expect(catalog[0].price).toBe(100);
  });

  it("does not silently choose between multiple model codes in one cell", async () => {
    const { outDir, catalogPath } = await fixture();
    const filePath = join(outDir, "multiple.xlsx");
    await workbook(filePath, [["DG-587 / DG-588", 72523000], ["DG-587 / DG-587-PRO", 72523000], ["DG-587 / 598-DX", 72523000]]);

    const report = await applyPriceList({ filePath, outDir, brand: "Datees" });
    expect(report.invalidRows).toBe(3);
    expect(report.matches.every((match) => match.status === "invalid")).toBe(true);
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    expect(catalog[0].price).toBe(100);
  });

  it("reports a raw/catalog identity conflict instead of updating the catalog", async () => {
    const { outDir, catalogPath } = await fixture();
    const rawPath = join(outDir, "raw-scrape.json");
    const raw = JSON.parse(await readFile(rawPath, "utf8"));
    raw[0].name = "اجاق گاز داتیس مدل DG-587 متفاوت";
    await writeFile(rawPath, JSON.stringify(raw));
    const filePath = join(outDir, "conflict.xlsx");
    await workbook(filePath, [["DG-587", 72523000]]);

    const report = await applyPriceList({ filePath, outDir, brand: "Datees" });
    expect(report.ambiguous).toBe(1);
    expect(report.updates).toHaveLength(0);
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    expect(catalog[0].price).toBe(100);
  });

  it("reports a model found only in the latest raw scrape without creating a catalog Product", async () => {
    const { outDir, catalogPath } = await fixture();
    const rawPath = join(outDir, "raw-scrape.json");
    const raw = JSON.parse(await readFile(rawPath, "utf8"));
    raw.push({ ...raw[0], url: "https://datees.ir/product/dg-999", name: "اجاق گاز داتیس مدل DG-999", specs: [{ label: "نام مدل", value: "DG-999" }] });
    await writeFile(rawPath, JSON.stringify(raw));
    const filePath = join(outDir, "raw-only.xlsx");
    await workbook(filePath, [["DG-999", 12300000]]);

    const report = await applyPriceList({ filePath, outDir, brand: "Datees" });
    expect(report.rawOnly).toBe(1);
    expect(report.updates).toHaveLength(0);
    expect(JSON.parse(await readFile(catalogPath, "utf8"))).toHaveLength(1);
  });

  it("persists a dry-run report while leaving the catalog untouched", async () => {
    const { outDir, catalogPath } = await fixture();
    const filePath = join(outDir, "preview.xlsx");
    await workbook(filePath, [["DG-587", 72523000]]);

    const report = await applyPriceList({ filePath, outDir, brand: "Datees", dryRun: true });
    expect(report.written).toBe(false);
    expect(report.reportWritten).toBe(true);
    expect(JSON.parse(await readFile(join(outDir, "price-list-report.json"), "utf8")).written).toBe(false);
    expect(JSON.parse(await readFile(catalogPath, "utf8"))[0].price).toBe(100);
  });

  it("rejects a stale catalog/raw revision before applying a list", async () => {
    const { outDir, catalogPath } = await fixture();
    const filePath = join(outDir, "stale.xlsx");
    await workbook(filePath, [["DG-587", 72523000]]);
    const rawPath = join(outDir, "raw-scrape.json");
    const revision = createHash("sha256")
      .update(await readFile(catalogPath))
      .update(await readFile(rawPath))
      .digest("hex");
    const raw = JSON.parse(await readFile(rawPath, "utf8"));
    raw[0].name = "changed raw record";
    await writeFile(rawPath, JSON.stringify(raw));

    await expect(applyPriceList({ filePath, outDir, brand: "Datees", expectedRevision: revision })).rejects.toThrow("CATALOG_CHANGED");
    expect(JSON.parse(await readFile(catalogPath, "utf8"))[0].price).toBe(100);
  });

  it("supports word models and converts a declared rial price to Toman", async () => {
    const { outDir, catalogPath } = await fixture();
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    catalog[0]._id = "VOLIRA";
    catalog[0].slug = "datees-volira";
    catalog[0].name = "هود داتیس مدل Volira";
    catalog[0].specs = [{ label: "نام مدل", value: "Volira" }];
    await writeFile(catalogPath, JSON.stringify(catalog));
    const filePath = join(outDir, "rial.xlsx");
    await workbook(filePath, [["Volira", 725230000]], ["مدل", "قیمت مصرف کننده (ریال)"]);

    const report = await applyPriceList({ filePath, outDir, brand: "داتیس" });
    expect(report.sourceUnits).toContain("rial");
    expect(report.matchedCatalog).toBe(1);
    expect(JSON.parse(await readFile(catalogPath, "utf8"))[0].price).toBe(72523000);
  });
});

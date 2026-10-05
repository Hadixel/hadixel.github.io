// Optional price enrichment sources. Manufacturer pages often omit prices;
// a separate retailer/source can provide the current price without changing
// the product-content adapter.

import { fetchHtml, type FetchOptions } from "./http";
import { extractModel, normalizeFa } from "./refine";
import type { ScrapeRecord } from "./types";

export const DATEES_SHOP_ORIGIN = "https://dateesshop.com";
export const DATEES_SHOP_PRODUCTS_URL = `${DATEES_SHOP_ORIGIN}/api/shop/minimal-products?limit=500`;
export const DATEES_SHOP_CATALOG_URL = `${DATEES_SHOP_ORIGIN}/api/shop/products?limit=200&page=1`;

export interface PriceQuote {
  price: number;
  priceByColor?: Record<string, number>;
  currency: "TOMAN";
  fetchedAt: number;
  inStock?: boolean;
  sourceId: "dateesshop";
  sourceUrl: string;
  productName: string;
}

interface DateesShopVariant {
  price?: unknown;
  original_price?: unknown;
  inventory?: unknown;
  attributes?: unknown;
}

interface DateesShopProduct {
  product_name?: unknown;
  product_slug?: unknown;
  price?: unknown;
  min_price?: unknown;
  max_price?: unknown;
  total_stock?: unknown;
  stock_status?: unknown;
  variants?: unknown;
}

function numericPrice(value: unknown): number | null {
  const number = typeof value === "number"
    ? value
    : Number(normalizeFa(String(value ?? "")).replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function modelKey(value: string): string {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function nameKey(value: string): string {
  return normalizeFa(value).replace(/[\s\u200c_-]+/g, "").toLocaleLowerCase("fa");
}

function productModel(productName: string, productSlug: string): string {
  const fromName = extractModel(productName, [{ label: "مدل", value: productName }]);
  if (fromName) return modelKey(fromName);
  const decoded = decodeURIComponent(productSlug).split("/").filter(Boolean).pop() ?? "";
  return modelKey(decoded.split("-").pop() ?? decoded);
}

function productUrl(productSlug: string): string {
  try {
    if (/^https?:\/\//i.test(productSlug)) return new URL(productSlug).toString();
    return new URL(`/product/${encodeURIComponent(productSlug)}`, DATEES_SHOP_ORIGIN).toString();
  } catch {
    return `${DATEES_SHOP_ORIGIN}/product/${encodeURIComponent(productSlug)}`;
  }
}

function addQuote(index: Map<string, PriceQuote>, key: string, quote: PriceQuote): void {
  if (!key) return;
  const existing = index.get(key);
  if (!existing) {
    index.set(key, quote);
    return;
  }
  if (quote.priceByColor) existing.priceByColor = { ...(existing.priceByColor ?? {}), ...quote.priceByColor };
  if (quote.inStock === true) existing.inStock = true;
  if (quote.price < existing.price) {
    existing.price = quote.price;
    existing.sourceUrl = quote.sourceUrl;
    existing.productName = quote.productName;
    existing.currency = quote.currency;
    existing.fetchedAt = quote.fetchedAt;
    existing.inStock = quote.inStock;
  }
}

function colorToken(value: string): string | undefined {
  const text = normalizeFa(value);
  if (/مشکی|سیاه/i.test(text)) return "black";
  if (/سفید|صدفی/i.test(text)) return "white";
  if (/طوسی|خاکستری/i.test(text)) return "gray";
  if (/کرم|بژ/i.test(text)) return "beige";
  if (/نقره/i.test(text)) return "silver";
  if (/استیل|زنگ/i.test(text)) return "steel";
  return undefined;
}

function variantPriceData(product: DateesShopProduct): { prices: number[]; byColor: Record<string, number>; inStock?: boolean } {
  const prices: number[] = [];
  const byColor: Record<string, number> = {};
  const stockFlags: boolean[] = [];
  let sawVariant = false;
  let sawLiveVariant = false;
  const variants = Array.isArray(product.variants) ? product.variants as DateesShopVariant[] : [];
  for (const variant of variants) {
    const price = numericPrice(variant.price);
    if (!price) continue;
    sawVariant = true;
    const inventory = Number(variant.inventory);
    // Availability gates the price, and it is per variant because Datees keeps a dead colour's page
    // and number up while nothing ships. «ناموجود» is the shop saying it cannot sell this; quoting
    // it would hand the watcher a price for a product nobody can have. The per-colour map is also
    // filtered, so a stocked variant's price cannot be undercut by a dead colour of the same model.
    if (Number.isFinite(inventory) && inventory <= 0) continue;
    sawLiveVariant = true;
    prices.push(price);
    if (Number.isFinite(inventory)) stockFlags.push(inventory > 0);
    const attributes = Array.isArray(variant.attributes) ? variant.attributes : [];
    for (const raw of attributes) {
      if (!raw || typeof raw !== "object") continue;
      const attribute = raw as Record<string, unknown>;
      const label = typeof attribute.name === "string" ? attribute.name : "";
      const value = typeof attribute.value === "string" ? attribute.value : "";
      if (!/رنگ|color/i.test(normalizeFa(label))) continue;
      const token = colorToken(value);
      if (token && (!byColor[token] || price < byColor[token])) byColor[token] = price;
    }
  }
  for (const value of [product.price, product.min_price]) {
    const price = numericPrice(value);
    if (price) prices.push(price);
  }
  const totalStock = Number(product.total_stock);
  if (Number.isFinite(totalStock)) stockFlags.push(totalStock > 0);
  if (typeof product.stock_status === "string") {
    stockFlags.push(!/ناموجود|out.of.stock/i.test(normalizeFa(product.stock_status)));
  }
  // "Every variant is dead" is `false`, not "unknown". Once dead variants are filtered out, a flag
  // array built only from the survivors can be empty — the `some` below would then answer
  // `undefined`, and a consumer deciding on `inStock === false` would take a fully sold-out product
  // for one whose availability the source did not say. The source did say: it listed variants and
  // none of them ships. When no variant was listed at all, availability really is unknown, and the
  // absence stays.
  if (sawVariant && !sawLiveVariant) return { prices, byColor, inStock: false };
  return { prices, byColor, inStock: stockFlags.length ? stockFlags.some(Boolean) : undefined };
}

function readProductPayload(body: string): DateesShopProduct[] {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("Datees Shop returned invalid JSON");
  }
  if (!payload || typeof payload !== "object") throw new Error("Datees Shop returned an invalid response");
  const root = payload as { success?: unknown; data?: { products?: unknown } };
  if (root.success !== true || !root.data || !Array.isArray(root.data.products)) {
    throw new Error("Datees Shop product response was incomplete");
  }
  return root.data.products as DateesShopProduct[];
}

function addProduct(index: Map<string, PriceQuote>, product: DateesShopProduct): void {
  if (typeof product.product_name !== "string" || typeof product.product_slug !== "string") return;
  const { prices, byColor, inStock } = variantPriceData(product);
  if (!prices.length) return;
  const quote: PriceQuote = {
    price: Math.min(...prices),
    currency: "TOMAN",
    fetchedAt: Date.now(),
    ...(inStock === undefined ? {} : { inStock }),
    ...(Object.keys(byColor).length ? { priceByColor: byColor } : {}),
    sourceId: "dateesshop",
    sourceUrl: productUrl(product.product_slug),
    productName: product.product_name,
  };
  addQuote(index, modelKey(productModel(product.product_name, product.product_slug)), quote);
  addQuote(index, nameKey(product.product_name), quote);
}

/** Fetch current Datees shop prices and model aliases with minimal requests. */
export async function fetchDateesShopPriceIndex(
  fetchOpts: FetchOptions = {},
): Promise<Map<string, PriceQuote>> {
  const index = new Map<string, PriceQuote>();
  const priceFetchOpts: FetchOptions = {
    ...fetchOpts,
    cacheTtlMs: fetchOpts.cacheTtlMs ?? 15 * 60 * 1000,
  };
  let lastError: unknown;
  try {
    const products = readProductPayload(await fetchHtml(DATEES_SHOP_CATALOG_URL, priceFetchOpts));
    for (const product of products) addProduct(index, product);
  } catch (error) {
    lastError = error;
  }
  try {
    const products = readProductPayload(await fetchHtml(DATEES_SHOP_PRODUCTS_URL, priceFetchOpts));
    for (const product of products) addProduct(index, product);
  } catch (error) {
    lastError = error;
  }
  if (!index.size && lastError) throw lastError;
  return index;
}

/** Find a price using model first, then normalized product name. */
export function matchDateesShopPrice(
  record: ScrapeRecord,
  index: Map<string, PriceQuote>,
): PriceQuote | undefined {
  const model = extractModel(record.name, record.specs);
  return (model ? index.get(modelKey(model)) : undefined) ?? index.get(nameKey(record.name));
}

/**
 * The color token a source uses for one colour name, or nothing.
 *
 * Exported because the price watch has to resolve a per-variant price out of `priceByColor` and
 * the only honest way to ask "which key is this colour?" is with the function that built the map.
 * A second Persian-colour table in the gateway would be a second answer to the same question, and
 * the two would disagree on the first colour one of them had not heard of.
 */
export function dateesShopColorToken(colorName: string): string | undefined {
  return colorToken(colorName);
}

/**
 * A price for a product, by model first and then by normalized name.
 *
 * This is deliberately *not* a widened `matchDateesShopPrice`. That one takes a `ScrapeRecord`,
 * which is a scrape output: a name plus the spec rows the adapter happened to collect, from which
 * a model is extracted. A `Product` row in the database is not a `ScrapeRecord` — it has no spec
 * rows to read, it has a `model` column that was written by an earlier import of exactly these
 * records. Widening the existing function would mean its parameter type became "a thing that may
 * or may not have specs", and the `extractModel(record.name, record.specs)` call inside it would
 * then have a branch that guesses whether a field is present. Two functions, one rule each, and
 * the model is read from the column that holds it rather than re-derived from a description.
 */
export function matchDateesShopProductPrice(
  product: { name: string; model?: string | null },
  index: Map<string, PriceQuote>,
): PriceQuote | undefined {
  const model = product.model ? modelKey(product.model) : "";
  return (model ? index.get(model) : undefined) ?? index.get(nameKey(product.name));
}

// One home for the per-product discount rule — which discount applies to a product, what it takes
// off, and the label and prices the storefront draws it with.
//
// The rule has three readers and used to have two homes: the deals section built it inline, the
// till owns its cart-level copy in `checkout/discounts.ts`, and every other product read showed no
// discount at all. This module is the product-read home. The reads in `catalogue/` and `content/`
// resolve through it, the deals section reads what it resolved, and the till keeps checking the
// things only a cart can know.
//
// What this module deliberately does NOT check, and why it is not an oversight:
//
//   - `minOrderSubtotal` — a card cannot know what a cart will hold, and the deals read never
//     checked it either.
//   - usage caps (`maxUsesTotal` / `maxUsesPerCustomer`) — same reason: counting redemptions is
//     the till's question, and the deals read never asked it.
//
// The till (`checkout/discounts.ts`) still checks both, plus coupons and stacking, for the order
// itself. A card advertises the discount; the till decides the order.

import { formatToman, toFaDigits } from "@kmodern/contracts/format";
import type { PrismaClient } from "../prisma/index.js";

/**
 * The slice of the data client the rule reads through: the discounts themselves, and the one
 * relation — collection membership — that a `COLLECTIONS` scope lives in.
 */
type ProductDiscountDb = Pick<PrismaClient, "discount" | "collectionItem">;

/** A product as the resolution sees it. The lead price is what a saving is measured against. */
export interface ProductDiscountTarget {
  id: string;
  /** The product's own category — `CATEGORIES` scope matches this, as the till matches a cart's. */
  categoryId: string;
  /** The card's price: the cheapest sellable variant, as every read prices the product. */
  price: number;
}

/** The winning rule for one product, narrowed to the columns the product rule reads. */
export interface ProductDiscountRule {
  id: string;
  type: "PERCENT" | "FIXED";
  value: number;
  maxAmount: number | null;
  endsAt: Date | null;
}

/** A candidate row: the rule plus the scope columns saying which products it names. */
type Candidate = ProductDiscountRule & {
  scope: "ALL" | "PRODUCTS" | "CATEGORIES" | "COLLECTIONS";
  productIds: string[];
  categoryIds: string[];
  collectionIds: string[];
};

/** The `discount` field a card carries (`CatalogueProduct`, `HomeProduct`). */
export interface CardDiscount {
  label: string;
  discountedPrice: number;
  endsAt: string | null;
}

/** The `discount` field the product page carries (`CatalogueProductDetail`). */
export interface DetailDiscount {
  label: string;
  endsAt: string | null;
  variantPrices: Record<string, number>;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * Toman off one price under a rule — the amount the rule takes, rounded to a whole toman and never
 * below zero.
 */
export function amountOff(rule: ProductDiscountRule, price: number): number {
  const off =
    rule.type === "PERCENT"
      ? (clamp(rule.value, 0, 100) * Math.max(price, 0)) / 100
      : clamp(rule.value, 0, price);
  const capped =
    rule.type === "PERCENT" && rule.maxAmount !== null ? Math.min(off, rule.maxAmount) : off;
  return Math.max(0, Math.round(capped));
}

/** The label, exactly the string the deals section has always rendered. */
export function discountLabel(rule: ProductDiscountRule): string {
  return rule.type === "PERCENT"
    ? `${toFaDigits(Math.round(rule.value))}٪`
    : formatToman(rule.value);
}

/**
 * A card's `discount`, built in one place so the listing, the collection, the home rails and the
 * deal read cannot drift apart on the same product.
 */
export function cardDiscount(
  rule: ProductDiscountRule | null,
  leadPrice: number,
): CardDiscount | null {
  if (!rule) return null;
  return {
    label: discountLabel(rule),
    discountedPrice: Math.max(0, Math.round(leadPrice - amountOff(rule, leadPrice))),
    endsAt: rule.endsAt ? rule.endsAt.toISOString() : null,
  };
}

/**
 * The product page's `discount`: the same winning rule applied to every variant's own price, so a
 * buy box can show each colour its discounted price without re-deriving the rule.
 */
export function detailDiscount(
  rule: ProductDiscountRule | null,
  variantPrices: Readonly<Record<string, number>>,
): DetailDiscount | null {
  if (!rule) return null;
  const prices: Record<string, number> = {};
  for (const [variantId, price] of Object.entries(variantPrices)) {
    prices[variantId] = Math.max(0, Math.round(price - amountOff(rule, price)));
  }
  return {
    label: discountLabel(rule),
    endsAt: rule.endsAt ? rule.endsAt.toISOString() : null,
    variantPrices: prices,
  };
}

/**
 * The winning discount for each target, or no entry for a product nothing targets.
 *
 * Candidates mirror the till's `usable`/`inScope` in `checkout/discounts.ts`: ACTIVE, AUTOMATIC,
 * a merchandise type (PERCENT/FIXED — never FREE_DELIVERY, which takes nothing off a price),
 * inside its window, and naming the product through its scope. The winner is the candidate taking
 * the most Toman off the target's lead price — compared in money, not in percentage — with ties
 * broken by the smaller discount id so the same rows always answer the same way.
 *
 * One discount query per call, plus at most one collection-membership query for the whole batch:
 * never one query per product.
 */
export async function resolveProductDiscounts(
  db: ProductDiscountDb,
  targets: readonly ProductDiscountTarget[],
  now: Date = new Date(),
): Promise<Map<string, ProductDiscountRule>> {
  const winners = new Map<string, ProductDiscountRule>();
  if (targets.length === 0) return winners;

  const rows = await db.discount.findMany({
    where: {
      status: "ACTIVE",
      mode: "AUTOMATIC",
      type: { in: ["PERCENT", "FIXED"] },
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
  });

  const candidates: Candidate[] = [];
  for (const row of rows) {
    // The where clause above already excludes it; this narrows the type as well.
    if (row.type !== "PERCENT" && row.type !== "FIXED") continue;
    candidates.push({
      id: row.id,
      type: row.type,
      value: row.value,
      maxAmount: row.maxAmount,
      endsAt: row.endsAt,
      scope: row.scope,
      productIds: row.productIds,
      categoryIds: row.categoryIds,
      collectionIds: row.collectionIds,
    });
  }
  if (candidates.length === 0) return winners;

  // COLLECTIONS is the only scope living in a relation rather than a scalar list. Reading it one
  // product at a time is the N+1 this module exists to avoid, so every target's memberships come
  // back in one query.
  const memberships = new Map<string, string[]>();
  if (candidates.some((candidate) => candidate.scope === "COLLECTIONS")) {
    const items = await db.collectionItem.findMany({
      where: { productId: { in: targets.map((target) => target.id) } },
      select: { productId: true, collectionId: true },
    });
    for (const item of items) {
      const ids = memberships.get(item.productId) ?? [];
      ids.push(item.collectionId);
      memberships.set(item.productId, ids);
    }
  }

  for (const target of targets) {
    const collectionIds = memberships.get(target.id) ?? [];
    let winner: ProductDiscountRule | null = null;
    let winning = -1;
    for (const candidate of candidates) {
      if (!appliesTo(candidate, target, collectionIds)) continue;
      const off = amountOff(candidate, target.price);
      if (off > winning || (off === winning && winner !== null && candidate.id < winner.id)) {
        winner = candidate;
        winning = off;
      }
    }
    if (winner) winners.set(target.id, winner);
  }
  return winners;
}

/**
 * Whether a candidate names this product — the till's `inScope`, for one product rather than for
 * a cart's ids.
 */
function appliesTo(
  candidate: Candidate,
  target: ProductDiscountTarget,
  collectionIds: string[],
): boolean {
  if (candidate.scope === "ALL") return true;
  if (candidate.scope === "PRODUCTS") return candidate.productIds.includes(target.id);
  if (candidate.scope === "CATEGORIES") return candidate.categoryIds.includes(target.categoryId);
  return collectionIds.some((id) => candidate.collectionIds.includes(id));
}

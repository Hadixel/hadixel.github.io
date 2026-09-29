// Discount application, in the gateway.
//
// Moved here from the storefront, where it was one of five delivery and pricing rules inlined in a
// route handler. A discount rule that lives in a client is a rule the admin's manual-order form cannot
// reach, which is how an automatic discount ends up applied on one path and not the other.
//
// The rules, unchanged in substance:
//
//   1. at most one merchandise discount (PERCENT/FIXED) per order
//   2. FREE_DELIVERY may stack with it
//   3. a coupon beats an automatic discount for merchandise
//   4. no coupon — the best single automatic discount, measured in TOMAN off
//   5. FREE_DELIVERY is idempotent
//
// Usage limits are checked for automatic discounts as well as coupons. That is not an optimisation: an
// automatic discount that ignored its cap would be a discount a merchant cannot exhaust, which is the
// whole point of setting a cap.

import type { Prisma } from "../generated/prisma/client.js";
import type { CheckoutDb as Db } from "./db-types.js";
type DbDiscount = Prisma.DiscountGetPayload<Record<string, never>>;

export interface DiscountContext {
  /** Merchandise before discount. */
  subtotal: number;
  /** Distinct products in the cart. */
  productIds: string[];
  /** Distinct categories of the cart's lines. */
  categoryIds: string[];
  /** Distinct collections covering the cart's lines. */
  collectionIds: string[];
  customerId?: string;
}

export interface AppliedDiscount {
  discountId: string;
  title: string;
  code?: string | null;
  type: "PERCENT" | "FIXED" | "FREE_DELIVERY";
  /** TOMAN off merchandise. Zero for a free-delivery discount, which is not a price reduction. */
  amountOff: number;
  freeDelivery: boolean;
}

export interface DiscountResult {
  discountAmount: number;
  freeDelivery: boolean;
  applied: AppliedDiscount[];
  /** Set when a code was entered and refused — surfaced to the checkout, not thrown. */
  couponError?: string;
}

function inScope(d: DbDiscount, ctx: DiscountContext): boolean {
  if (d.scope === "ALL") return true;
  if (d.scope === "PRODUCTS") return ctx.productIds.some((id) => d.productIds.includes(id));
  if (d.scope === "CATEGORIES") return ctx.categoryIds.some((id) => d.categoryIds.includes(id));
  if (d.scope === "COLLECTIONS") return ctx.collectionIds.some((id) => d.collectionIds.includes(id));
  return false;
}

function usable(d: DbDiscount, ctx: DiscountContext, now: Date): boolean {
  if (d.status !== "ACTIVE") return false;
  if (now < d.startsAt) return false;
  if (d.endsAt && now > d.endsAt) return false;
  if (d.minOrderSubtotal !== null && ctx.subtotal < d.minOrderSubtotal) return false;
  return inScope(d, ctx);
}

function amountOff(d: DbDiscount, subtotal: number): number {
  if (d.type === "PERCENT") {
    const off = (Math.max(subtotal, 0) * Math.min(Math.max(d.value, 0), 100)) / 100;
    return d.maxAmount !== null ? Math.min(off, Math.max(d.maxAmount, 0)) : off;
  }
  if (d.type === "FREE_DELIVERY") return 0;
  return Math.min(Math.max(d.value, 0), Math.max(subtotal, 0));
}

/** How many times a discount has been used, overall and by one customer. */
async function redemptionCount(db: Db, discountId: string, customerId?: string): Promise<number> {
  const orders = await db.order.findMany({
    where: customerId ? { customerId } : {},
    select: { appliedDiscounts: true },
  });
  return orders.filter((order) => {
    if (!order.appliedDiscounts) return false;
    const list = Array.isArray(order.appliedDiscounts)
      ? order.appliedDiscounts
      : [order.appliedDiscounts];
    return list.some(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        (entry as Record<string, unknown>).discountId === discountId,
    );
  }).length;
}

export async function applyDiscounts(
  db: Db,
  ctx: DiscountContext,
  couponCode?: string,
  now: Date = new Date(),
): Promise<DiscountResult> {
  const all = await db.discount.findMany({
    where: {
      status: "ACTIVE",
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
  });

  const underLimit = async (d: DbDiscount): Promise<boolean> => {
    if (d.maxUsesTotal !== null && (await redemptionCount(db, d.id)) >= d.maxUsesTotal) return false;
    if (
      d.maxUsesPerCustomer !== null &&
      ctx.customerId &&
      (await redemptionCount(db, d.id, ctx.customerId)) >= d.maxUsesPerCustomer
    ) {
      return false;
    }
    return true;
  };

  const inWindow = all.filter((d) => usable(d, ctx, now));
  const coupons = inWindow.filter((d) => d.mode === "COUPON" && d.code);
  const automaticCandidates = inWindow.filter((d) => d.mode === "AUTOMATIC");
  const automatics = (
    await Promise.all(automaticCandidates.map(async (d) => ((await underLimit(d)) ? d : null)))
  ).filter((d): d is DbDiscount => d !== null);

  let coupon: DbDiscount | null = null;
  let couponError: string | undefined;
  if (couponCode) {
    // Compared case-insensitively on both sides: a shopper typing a code in a different case has not
    // typed a different code, and telling them it is invalid is a support call.
    const wanted = couponCode.trim().toLowerCase();
    const match = coupons.find((d) => d.code?.trim().toLowerCase() === wanted) ?? null;
    if (!match) {
      couponError = "کد تخفیف نامعتبر است";
    } else if (!(await underLimit(match))) {
      couponError = "کد تخفیف منقضی یا استفاده شده است";
    } else {
      coupon = match;
    }
  }

  const freeCoupon = !couponError && coupon?.type === "FREE_DELIVERY" ? coupon : null;
  const merchCoupon = coupon && coupon.type !== "FREE_DELIVERY" && !couponError ? coupon : null;
  const freeAutomatic = automatics.find((d) => d.type === "FREE_DELIVERY") ?? null;
  const merch = merchCoupon ?? bestAutomatic(automatics, ctx.subtotal);

  const applied: AppliedDiscount[] = [];
  if (merch) {
    applied.push({
      discountId: merch.id,
      title: merch.code ?? "تخفیف خودکار",
      code: merch.code,
      type: merch.type as "PERCENT" | "FIXED",
      amountOff: amountOff(merch, ctx.subtotal),
      freeDelivery: false,
    });
  }
  const freeDeliveryDiscount = freeCoupon ?? freeAutomatic;
  if (freeDeliveryDiscount) {
    applied.push({
      discountId: freeDeliveryDiscount.id,
      title: freeDeliveryDiscount.code ?? "ارسال رایگان",
      code: freeDeliveryDiscount.code,
      type: "FREE_DELIVERY",
      amountOff: 0,
      freeDelivery: true,
    });
  }

  return {
    discountAmount: merch ? amountOff(merch, ctx.subtotal) : 0,
    freeDelivery: freeDeliveryDiscount !== null,
    applied,
    couponError,
  };
}

/** The automatic discount taking the most TOMAN off. Compared in money, not in percentage. */
function bestAutomatic(list: DbDiscount[], subtotal: number): DbDiscount | null {
  let best: DbDiscount | null = null;
  for (const d of list) {
    if (d.type === "FREE_DELIVERY") continue;
    if (!best || amountOff(d, subtotal) > amountOff(best, subtotal)) best = d;
  }
  return best;
}

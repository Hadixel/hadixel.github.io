import { db, type Prisma } from "@kmodern/db";
import { settingKeys } from "@kmodern/schema/setting-keys";
import { getSettingOrDefault } from "./settings";

// 018 discount application. Rules:
//   1. at most one merch discount (PERCENT/FIXED) per order
//   2. FREE_DELIVERY may stack with it
//   3. coupon beats automatic for merch
//   4. no coupon -> best single automatic (largest TOMAN off)
//   5. FREE_DELIVERY idempotent
//   total = merchandiseSubtotal - discountAmount + deliveryFee

export interface DiscountCandidate {
  id: string;
  type: "PERCENT" | "FIXED" | "FREE_DELIVERY";
  mode: "COUPON" | "AUTOMATIC";
  code?: string | null;
  value: number;
  maxAmount?: number | null;
  title: string;
}

export interface DiscountContext {
  subtotal: number; // merchandise before discount
  productIds: string[]; // distinct products in cart
  categoryIds: string[]; // distinct category ids of cart lines
  collectionIds: string[]; // distinct collections covering cart lines
  customerId?: string;
}

export interface AppliedDiscount {
  discountId: string;
  title: string;
  code?: string | null;
  type: "PERCENT" | "FIXED" | "FREE_DELIVERY";
  amountOff: number; // TOMAN off merchandise
  freeDelivery: boolean;
}

export interface DiscountResult {
  discountAmount: number;
  freeDelivery: boolean;
  applied: AppliedDiscount[];
  /** if coupon entered but invalid/unusable */
  couponError?: string;
}

function inScope(
  d: Prisma.DiscountGetPayload<Record<string, never>>,
  ctx: DiscountContext,
): boolean {
  if (d.scope === "ALL") return true;
  if (d.scope === "PRODUCTS") return ctx.productIds.some((id) => d.productIds.includes(id));
  if (d.scope === "CATEGORIES") return ctx.categoryIds.some((id) => d.categoryIds.includes(id));
  if (d.scope === "COLLECTIONS") return ctx.collectionIds.some((id) => d.collectionIds.includes(id));
  return false;
}

function usable(d: Prisma.DiscountGetPayload<Record<string, never>>, ctx: DiscountContext): boolean {
  if (d.status !== "ACTIVE") return false;
  const now = new Date();
  if (now < d.startsAt) return false;
  if (d.endsAt && now > d.endsAt) return false;
  if (d.minOrderSubtotal !== null && ctx.subtotal < d.minOrderSubtotal) return false;
  if (!inScope(d, ctx)) return false;
  return true;
}

type DbDiscount = Prisma.DiscountGetPayload<Record<string, never>>;

function amountOff(d: DbDiscount, subtotal: number): number {
  if (d.type === "PERCENT") {
    const off = (Math.max(subtotal, 0) * Math.min(Math.max(d.value, 0), 100)) / 100;
    return d.maxAmount !== null ? Math.min(off, Math.max(d.maxAmount, 0)) : off;
  }
  if (d.type === "FREE_DELIVERY") return 0;
  return Math.min(Math.max(d.value, 0), Math.max(subtotal, 0)); // FIXED
}

export async function applyDiscounts(
  ctx: DiscountContext,
  couponCode?: string,
): Promise<DiscountResult> {
  const where: Prisma.DiscountWhereInput = {
    status: "ACTIVE",
    startsAt: { lte: new Date() },
    OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }],
  };
  const all = await db().discount.findMany({ where });

  // Usage limits (total + per customer) are checked for automatic discounts
  // as well as coupons; otherwise an automatic discount can bypass its cap.
  async function underLimit(d: DbDiscount): Promise<boolean> {
    const countByDiscount = async (customerId?: string) => {
      const orders = await db().order.findMany({
        where: customerId ? { customerId } : {},
        select: { appliedDiscounts: true },
      });
      return orders.filter((o) => {
        if (!o.appliedDiscounts) return false;
        const arr = Array.isArray(o.appliedDiscounts) ? o.appliedDiscounts : [o.appliedDiscounts];
        return arr.some((a) => {
          if (a && typeof a === "object" && !Array.isArray(a) && "discountId" in a) {
            return (a as Record<string, unknown>).discountId === d.id;
          }
          return false;
        });
      }).length;
    };
    if (d.maxUsesTotal !== null && (await countByDiscount()) >= d.maxUsesTotal) return false;
    if (d.maxUsesPerCustomer !== null && ctx.customerId && (await countByDiscount(ctx.customerId)) >= d.maxUsesPerCustomer) return false;
    return true;
  }

  const coupons = all.filter((d) => d.mode === "COUPON" && d.code && usable(d, ctx));
  const automatics = all.filter((d) => d.mode === "AUTOMATIC" && usable(d, ctx));
  const usableAutomatics = (await Promise.all(automatics.map(async (d) => (await underLimit(d) ? d : null)))).filter((d): d is DbDiscount => Boolean(d));

  let coupon: DbDiscount | null = null;
  let couponError: string | undefined;
  if (couponCode) {
    const normalizedCode = couponCode.trim().toLowerCase();
    coupon = coupons.find((d) => d.code?.trim().toLowerCase() === normalizedCode) ?? null;
    if (!coupon) couponError = "کد تخفیف نامعتبر است";
    else if (!(await underLimit(coupon))) couponError = "کد تخفیف منقضی یا استفاده شده است";
  }

  const freeAutomatic = usableAutomatics.find((d) => d.type === "FREE_DELIVERY") ?? null;
  const freeCoupon = !couponError && coupon?.type === "FREE_DELIVERY" ? coupon : null;
  const merchCoupon = coupon && coupon.type !== "FREE_DELIVERY" && !couponError ? coupon : null;
  const merch = merchCoupon ?? bestAutomatic(usableAutomatics, ctx);
  const freeDelivery = freeCoupon ?? freeAutomatic;

  return buildResult(merch, ctx, { couponError, freeDeliveryDiscount: freeDelivery });
}

function bestAutomatic(
  list: DbDiscount[],
  ctx: DiscountContext,
): DbDiscount | null {
  let best: Prisma.DiscountGetPayload<Record<string, never>> | null = null;
  for (const d of list) {
    if (d.type === "FREE_DELIVERY") continue; // handled separately
    const off = amountOff(d, ctx.subtotal);
    if (!best || off > amountOff(best, ctx.subtotal)) best = d;
  }
  return best;
}

async function buildResult(
  merch: DbDiscount | null,
  ctx: DiscountContext,
  extra: { couponError?: string; freeDeliveryDiscount?: DbDiscount | null } = {},
): Promise<DiscountResult> {
  const applied: AppliedDiscount[] = [];
  let discountAmount = 0;
  let freeDelivery = false;

  if (merch) {
    const off = amountOff(merch, ctx.subtotal);
    discountAmount = off;
    applied.push({
      discountId: merch.id,
      title: merch.code ?? "تخفیف خودکار",
      code: merch.code,
      type: merch.type as "PERCENT" | "FIXED",
      amountOff: off,
      freeDelivery: false,
    });
  }
  const freeDeliveryDiscount = extra.freeDeliveryDiscount;
  if (freeDeliveryDiscount) {
    freeDelivery = true;
    applied.push({
      discountId: freeDeliveryDiscount.id,
      title: freeDeliveryDiscount.code ?? "ارسال رایگان",
      code: freeDeliveryDiscount.code,
      type: "FREE_DELIVERY",
      amountOff: 0,
      freeDelivery: true,
    });
  }

  return { discountAmount, freeDelivery, applied, couponError: extra.couponError };
}
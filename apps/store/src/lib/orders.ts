import { db, $Enums } from "@kmodern/db";
import { jalaliYear, type AddressInput } from "@kmodern/schema";
import type { CartItemInput } from "./cart";
import { applyDiscounts, type DiscountContext } from "./discounts";
import { assignShippingMethod } from "./shipping";

// 009/011 order context and totals. The stock lifecycle (reserve / commit / release /
// restock) is not here: it has one implementation in the data tier, and the two app-local
// copies this replaces had different guarantees — see @kmodern/db.

export interface PlaceOrderInput {
  customerId: string;
  address: AddressInput;
  items: CartItemInput[];
  paymentMethod: $Enums.PaymentMethod;
  couponCode?: string;
  ip?: string;
}

export interface LineContext {
  variantId: string;
  qty: number;
  price: number;
  productId: string;
  categoryId: string;
  weightKg: number;
  /** A backorder line may exceed free stock; the shared reserve rejects it unless this is true. */
  allowBackorder: boolean;
}

export async function buildOrderContext(items: CartItemInput[]) {
  const variants = await db().variant.findMany({
    where: { id: { in: items.map((i) => i.variantId) } },
    include: { product: { include: { category: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const lines: LineContext[] = [];
  for (const it of items) {
    const v = byId.get(it.variantId);
    if (!v) throw new Error(`variant not found: ${it.variantId}`);
    lines.push({
      variantId: v.id,
      qty: it.qty,
      price: v.price,
      productId: v.productId,
      categoryId: v.product.categoryId,
      weightKg: v.product.category.weightKg,
      allowBackorder: v.allowBackorder,
    });
  }
  return lines;
}

/** total merchandise subtotal (011: no VAT) */
export function subtotalOf(lines: LineContext[]): number {
  return lines.reduce((s, l) => s + l.price * l.qty, 0);
}

/** 011 stock rule: reject entire place if any non-backorder line is short */
export function assertStock(lines: LineContext[], items: CartItemInput[], variants: Array<{ id: string; stock: number; reserved: number; allowBackorder: boolean }>) {
  const vmap = new Map(variants.map((v) => [v.id, v]));
  for (const it of items) {
    const v = vmap.get(it.variantId);
    if (!v) continue;
    const available = v.stock - v.reserved;
    if (!v.allowBackorder && available < it.qty) {
      throw new Error(`موجودی کافی نیست (${it.qty})`);
    }
  }
}

export async function nextOrderNumber(): Promise<string> {
  const year = jalaliYear();
  const counter = await db().orderNumberCounter.upsert({
    where: { jalaliYear: year },
    update: { lastNumber: { increment: 1 } },
    create: { jalaliYear: year, lastNumber: 1 },
  });
  return `${year}-${String(counter.lastNumber).padStart(6, "0")}`;
}

export interface OrderTotals {
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  total: number;
  freeDelivery: boolean;
  appliedDiscounts: unknown[];
  shippingMethod: $Enums.ShippingMethod;
  deliveryFeeMode: $Enums.DeliveryFeeMode;
  shippingNote?: string;
  /** set when a coupon code was entered but rejected — surfaced to checkout UI */
  couponError?: string;
}

export async function computeOrderTotals(
  lines: LineContext[],
  province: string,
  city: string,
  customerId: string,
  couponCode?: string,
): Promise<OrderTotals> {
  const subtotal = subtotalOf(lines);
  const discountCtx: DiscountContext = {
    subtotal,
    productIds: [...new Set(lines.map((l) => l.productId))],
    categoryIds: [...new Set(lines.map((l) => l.categoryId))],
    collectionIds: [],
    customerId,
  };
  const discount = await applyDiscounts(discountCtx, couponCode);
  const shipping = await assignShippingMethod(
    province,
    city,
    lines.map((l) => ({
      variantId: l.variantId,
      qty: l.qty,
      weightKg: l.weightKg,
      price: l.price,
      productName: "",
    })),
  );
  const deliveryFee = discount.freeDelivery ? 0 : shipping.deliveryFee;
  return {
    subtotal,
    discountAmount: discount.discountAmount,
    deliveryFee,
    total: subtotal - discount.discountAmount + deliveryFee,
    freeDelivery: discount.freeDelivery || shipping.deliveryFeeMode === "FREE",
    appliedDiscounts: discount.applied,
    shippingMethod: shipping.method,
    deliveryFeeMode: shipping.deliveryFeeMode,
    shippingNote: shipping.note,
    couponError: discount.couponError,
  };
}

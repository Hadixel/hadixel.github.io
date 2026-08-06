import { db, $Enums } from "@kmodern/db";
import { jalaliYear, type AddressInput, settingKeys } from "@kmodern/schema";
import type { CartItemInput } from "./cart";
import { getSettingOrDefault } from "./settings";
import { applyDiscounts, type DiscountContext } from "./discounts";
import { assignShippingMethod } from "./shipping";

// 009/011 order lifecycle: place (reserve) → PAID (commit) → fail/cancel
// (release). COD commits at place. Cancelling a committed order restocks.

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
  let counter = await db().orderNumberCounter.upsert({
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
  };
}

/** reserve stock on place (009/011); COD commits at place */
export async function reserveStock(
  orderId: string,
  lines: LineContext[],
  paymentMethod: $Enums.PaymentMethod,
): Promise<void> {
  const reserveMins = await getSettingOrDefault<number>(settingKeys.checkoutOnlineReserveMinutes, 30);
  const c2cHours = await getSettingOrDefault<number>(settingKeys.checkoutC2cReserveHours, 48);
  const now = new Date();
  for (const line of lines) {
    const expiresAt =
      paymentMethod === "ONLINE"
        ? new Date(now.getTime() + reserveMins * 60_000)
        : new Date(now.getTime() + c2cHours * 3_600_000);
    await db().variant.update({
      where: { id: line.variantId },
      data: { reserved: { increment: line.qty } },
    });
    await db().stockReservation.create({
      data: {
        orderId,
        variantId: line.variantId,
        qty: line.qty,
        status: "ACTIVE",
        expiresAt,
      },
    });
  }
}

/** commit on PAID: stock -= qty, reserved -= qty (009) */
export async function commitStock(orderId: string): Promise<void> {
  const reservations = await db().stockReservation.findMany({ where: { orderId } });
  for (const r of reservations) {
    await db().variant.update({
      where: { id: r.variantId },
      data: { stock: { decrement: r.qty }, reserved: { decrement: r.qty } },
    });
    await db().stockReservation.update({
      where: { id: r.id },
      data: { status: "COMMITTED" },
    });
  }
}

/** release on failure/expiry/cancel of an AWAITING order: reserved -= qty */
export async function releaseStock(orderId: string): Promise<void> {
  const reservations = await db().stockReservation.findMany({ where: { orderId } });
  for (const r of reservations) {
    if (r.status === "COMMITTED") continue;
    await db().variant.update({
      where: { id: r.variantId },
      data: { reserved: { decrement: r.qty } },
    });
    await db().stockReservation.update({ where: { id: r.id }, data: { status: "RELEASED" } });
  }
}

/** restock on cancelling/refunding a COMMITTED (paid) order (009) */
export async function restock(orderId: string): Promise<void> {
  const reservations = await db().stockReservation.findMany({ where: { orderId } });
  for (const r of reservations) {
    await db().variant.update({
      where: { id: r.variantId },
      data: { stock: { increment: r.qty } },
    });
    await db().stockReservation.update({ where: { id: r.id }, data: { status: "RELEASED" } });
  }
}

export async function recordOrderEvent(input: {
  orderId: string;
  dimension: $Enums.OrderEventDimension;
  from: string;
  to: string;
  actor: string;
  note?: string;
}) {
  await db().orderStatusEvent.create({ data: input });
}
// The one totals rule.
//
// `subtotal - discount + delivery` was written out in the storefront's checkout, in its preview route,
// and again in the panel's manual-order form. Three implementations of an arithmetic expression that a
// customer is quoted, and the divergence is invisible until two of them disagree about what a shopper
// owes.
//
// Everything here is a function of its arguments: no database, no clock, no environment. That is what
// makes it testable without a database and shareable between the shopper's checkout, the quote shown
// before committing, and an operator placing an order by hand.

import type { DiscountResult } from "./discounts.js";
import type { DeliveryFeeMode, ShippingMethod } from "./shipping.js";

export interface PricedLine {
  price: number;
  qty: number;
}

export interface OrderTotals {
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  total: number;
  freeDelivery: boolean;
  appliedDiscounts: DiscountResult["applied"];
  shippingMethod: ShippingMethod;
  deliveryFeeMode: DeliveryFeeMode;
  shippingNote?: string;
  /** Set when a code was entered and refused. Surfaced to the checkout; not an error. */
  couponError?: string;
}

export interface ShippingQuoteLike {
  method: ShippingMethod;
  deliveryFee: number;
  deliveryFeeMode: DeliveryFeeMode;
  note?: string;
}

/** Merchandise before discount. No VAT: prices are what they are. */
export function subtotalOf(lines: PricedLine[]): number {
  return lines.reduce((sum, line) => sum + line.price * line.qty, 0);
}

/**
 * Combine a subtotal, a discount result and a shipping quote into what the customer owes.
 *
 * A free-delivery discount zeroes the delivery fee rather than the subtotal, so the order still shows
 * what the goods cost. Rounding happens once, at the end: a total assembled from rounded parts drifts
 * by a rial per order, which is small enough to be invisible and large enough to be a reconciliation
 * problem.
 */
export function computeTotals(
  lines: PricedLine[],
  discount: DiscountResult,
  shipping: ShippingQuoteLike,
): OrderTotals {
  const subtotal = subtotalOf(lines);
  const deliveryFee = discount.freeDelivery ? 0 : shipping.deliveryFee;
  return {
    subtotal,
    discountAmount: discount.discountAmount,
    deliveryFee,
    total: Math.round(subtotal - discount.discountAmount + deliveryFee),
    freeDelivery: discount.freeDelivery || shipping.deliveryFeeMode === "FREE",
    appliedDiscounts: discount.applied,
    shippingMethod: shipping.method,
    deliveryFeeMode: shipping.deliveryFeeMode,
    shippingNote: shipping.note,
    couponError: discount.couponError,
  };
}

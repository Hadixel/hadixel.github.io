// Which orders may be paid for on delivery, and which a customer may hold open.
//
// These were two inline queries in the storefront's checkout handler, and one of them contradicted
// itself: the "at most one order awaiting payment" check let a cash-on-delivery order through while
// blocking every other method, with a comment that asked whether it should block. A rule that is
// written down but not decided is a rule that changes with whoever edits the handler.
//
// Each rule here is named, pure and separately testable, because the point of moving them is that they
// can be reasoned about away from a database.

import { settingKeys } from "@kmodern/contracts/setting-keys";
import type { CheckoutDb as Db } from "./db-types.js";
import type { ShippingMethod } from "./shipping.js";

/**
 * The ceiling above which cash on delivery is refused.
 *
 * Read from the merchant's setting with a documented default. The default used to be a literal in the
 * handler, so a shop that never configured a ceiling had one anyway and nobody could see it.
 */
export const DEFAULT_MAX_COD_TOTAL = 50_000_000;

export type CodRefusal = { ok: true } | { ok: false; reason: "not-eligible" | "over-ceiling" };

/**
 * Whether an order of this size to this destination may be paid for on delivery.
 *
 * Eligibility is about the destination, not the shopper: cash on delivery is a courier's rule, and the
 * merchant's own delivery zone is the only place the merchant controls what happens when the door
 * opens. A courier's other destinations are not the merchant's to offer.
 */
export function cashOnDeliveryAllowed(
  method: ShippingMethod,
  total: number,
  ceiling: number,
): CodRefusal {
  if (method !== "LOCAL") return { ok: false, reason: "not-eligible" };
  if (total > ceiling) return { ok: false, reason: "over-ceiling" };
  return { ok: true };
}

export async function codCeiling(db: Db): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: settingKeys.shippingMaxCodTotal } });
  return typeof row?.value === "number" && Number.isFinite(row.value) && row.value > 0
    ? row.value
    : DEFAULT_MAX_COD_TOTAL;
}

export const COD_REFUSAL_MESSAGES: Record<Exclude<CodRefusal, { ok: true }>["reason"], string> = {
  "not-eligible": "پرداخت هنگام تحویل فقط برای ارسال درونشهری کرمان فعال است.",
  "over-ceiling": "سقف پرداخت هنگام تحویل بیشتر از مبلغ سفارش است.",
};

/**
 * Whether a customer may open another order awaiting payment.
 *
 * One order at a time, for every method. The previous version exempted cash on delivery, which meant a
 * customer could accumulate any number of unpaid COD orders — the exact opposite of what the rule was
 * there to do, since COD is the method with no payment to wait for.
 *
 * A cash-on-delivery order created through the panel by an operator is not this customer's doing, so it
 * does not block them: the check looks for orders the customer placed themselves.
 */
export async function hasUnpaidOrder(db: Db, customerId: string): Promise<boolean> {
  const existing = await db.order.findFirst({
    where: { customerId, paymentStatus: "AWAITING" },
    select: { id: true },
  });
  return existing !== null;
}

export const UNPAID_ORDER_MESSAGE = "یک سفارش در انتظار پرداخت دارید.";

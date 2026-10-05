// The one order-number rule.
//
// A Jalali year and a zero-padded sequence, allocated by an upsert on a per-year counter row so two
// concurrent checkouts cannot be handed the same number. The row is the lock: `upsert` with an
// increment is atomic, so the number a caller receives is one nobody else received.
//
// This was duplicated — the storefront had one copy and the panel's manual-order form had another, and
// two implementations of a counter are two chances to hand a customer an order number that already
// exists.

import { jalaliYear } from "@kmodern/contracts";
import type { CheckoutDb as Db } from "./db-types.js";

export async function nextOrderNumber(db: Db, now: Date = new Date()): Promise<string> {
  const year = jalaliYear(now);
  const counter = await db.orderNumberCounter.upsert({
    where: { jalaliYear: year },
    update: { lastNumber: { increment: 1 } },
    create: { jalaliYear: year, lastNumber: 1 },
  });
  return `${year}-${String(counter.lastNumber).padStart(6, "0")}`;
}

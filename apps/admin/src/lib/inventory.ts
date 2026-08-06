import { db, $Enums } from "@kmodern/db";
import { settingKeys } from "@kmodern/schema";
import { getSettingOrDefault } from "./settings";

// 009/011 inventory lifecycle, mirroring apps/store/src/lib/orders.ts so the
// two apps can never disagree on stock math:
//   reserve (place) → commit (PAID) → release (fail/expiry/cancel of AWAITING)
//   restock (cancel/refund of a COMMITTED/paid order)
// Manual admin adjustments go through adjustVariantStock with an audit trail.

/** reserve stock on place; COD commits at place (same rule as store) */
export async function reserveStock(
  orderId: string,
  lines: Array<{ variantId: string; qty: number }>,
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
      data: { orderId, variantId: line.variantId, qty: line.qty, status: "ACTIVE", expiresAt },
    });
  }
}

/** commit on PAID: stock -= qty, reserved -= qty */
export async function commitStock(orderId: string): Promise<void> {
  const reservations = await db().stockReservation.findMany({ where: { orderId } });
  for (const r of reservations) {
    if (r.status !== "ACTIVE") continue;
    await db().variant.update({
      where: { id: r.variantId },
      data: { stock: { decrement: r.qty }, reserved: { decrement: r.qty } },
    });
    await db().stockReservation.update({ where: { id: r.id }, data: { status: "COMMITTED" } });
  }
}

/** release on failure/expiry/cancel of an AWAITING order: reserved -= qty */
export async function releaseStock(orderId: string): Promise<void> {
  const reservations = await db().stockReservation.findMany({ where: { orderId } });
  for (const r of reservations) {
    if (r.status !== "ACTIVE") continue;
    await db().variant.update({
      where: { id: r.variantId },
      data: { reserved: { decrement: r.qty } },
    });
    await db().stockReservation.update({ where: { id: r.id }, data: { status: "RELEASED" } });
  }
}

/** restock on cancelling/refunding a COMMITTED (paid) order */
export async function restock(orderId: string): Promise<void> {
  const reservations = await db().stockReservation.findMany({ where: { orderId } });
  for (const r of reservations) {
    if (r.status === "COMMITTED") {
      await db().variant.update({
        where: { id: r.variantId },
        data: { stock: { increment: r.qty } },
      });
    }
    await db().stockReservation.update({ where: { id: r.id }, data: { status: "RELEASED" } });
  }
}

export function recordOrderEvent(input: {
  orderId: string;
  dimension: $Enums.OrderEventDimension;
  from: string;
  to: string;
  actor: string;
  note?: string;
}) {
  return db().orderStatusEvent.create({ data: input });
}

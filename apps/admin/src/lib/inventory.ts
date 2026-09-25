import { db, $Enums, Prisma } from "@kmodern/db";
import { settingKeys } from "@kmodern/schema/setting-keys";
import { getSettingOrDefault } from "./settings";

// 009/011 inventory lifecycle, mirroring apps/store/src/lib/orders.ts so the
// two apps can never disagree on stock math:
//   reserve (place) → commit (PAID) → release (fail/expiry/cancel of AWAITING)
//   restock (cancel/refund of a COMMITTED/paid order)
// Manual admin adjustments go through adjustVariantStock with an audit trail.

type InventoryClient = Pick<Prisma.TransactionClient, "variant" | "stockReservation">;

type StockLine = { variantId: string; qty: number; allowBackorder?: boolean };

async function reserveStockInClient(
  client: InventoryClient,
  orderId: string,
  lines: StockLine[],
  expiresAt: Date,
): Promise<void> {
  for (const line of lines) {
    const variant = await client.variant.findUnique({ where: { id: line.variantId } });
    if (!variant) throw new Error(`VARIANT_NOT_FOUND:${line.variantId}`);
    if (!Number.isInteger(line.qty) || line.qty <= 0) throw new Error("INVALID_STOCK_QUANTITY");
    if (!line.allowBackorder && variant.stock - variant.reserved < line.qty) {
      throw new Error(`INSUFFICIENT_STOCK:${line.variantId}`);
    }
    const updated = await client.variant.updateMany({
      where: { id: line.variantId, stock: variant.stock, reserved: variant.reserved },
      data: { reserved: { increment: line.qty } },
    });
    if (updated.count !== 1) throw new Error(`STOCK_CHANGED:${line.variantId}`);
    await client.stockReservation.create({
      data: { orderId, variantId: line.variantId, qty: line.qty, status: "ACTIVE", expiresAt },
    });
  }
}

/** Reserve stock on place; COD commits at place (same rule as store). */
export async function reserveStock(
  orderId: string,
  lines: StockLine[],
  paymentMethod: $Enums.PaymentMethod,
  client?: InventoryClient,
  expiresAt?: Date,
): Promise<void> {
  let expiry = expiresAt;
  if (!expiry) {
    const reserveMins = await getSettingOrDefault<number>(settingKeys.checkoutOnlineReserveMinutes, 30);
    const c2cHours = await getSettingOrDefault<number>(settingKeys.checkoutC2cReserveHours, 48);
    expiry = new Date(Date.now() + (paymentMethod === "ONLINE"
      ? reserveMins * 60_000
      : c2cHours * 3_600_000));
  }
  if (client) {
    await reserveStockInClient(client, orderId, lines, expiry);
    return;
  }
  await db().$transaction((tx) => reserveStockInClient(tx, orderId, lines, expiry!));
}

/** Commit on PAID: stock -= qty, reserved -= qty. */
export async function commitStock(orderId: string, client?: InventoryClient): Promise<void> {
  const run = async (tx: InventoryClient) => {
    const reservations = await tx.stockReservation.findMany({ where: { orderId } });
    for (const reservation of reservations) {
      const claimed = await tx.stockReservation.updateMany({
        where: { id: reservation.id, status: "ACTIVE" },
        data: { status: "COMMITTED" },
      });
      if (claimed.count !== 1) continue;
      await tx.variant.update({
        where: { id: reservation.variantId },
        data: { stock: { decrement: reservation.qty }, reserved: { decrement: reservation.qty } },
      });
    }
  };
  if (client) await run(client);
  else await db().$transaction((tx) => run(tx));
}

/** Release on failure/expiry/cancel of an AWAITING order. */
export async function releaseStock(orderId: string, client?: InventoryClient): Promise<void> {
  const run = async (tx: InventoryClient) => {
    const reservations = await tx.stockReservation.findMany({ where: { orderId } });
    for (const reservation of reservations) {
      const claimed = await tx.stockReservation.updateMany({
        where: { id: reservation.id, status: "ACTIVE" },
        data: { status: "RELEASED" },
      });
      if (claimed.count !== 1) continue;
      const updated = await tx.variant.updateMany({
        where: { id: reservation.variantId, reserved: { gte: reservation.qty } },
        data: { reserved: { decrement: reservation.qty } },
      });
      if (updated.count !== 1) throw new Error(`INVENTORY_INCONSISTENT:${reservation.variantId}`);
    }
  };
  if (client) await run(client);
  else await db().$transaction((tx) => run(tx));
}

/** Restock on cancelling/refunding a COMMITTED (paid) order. */
export async function restock(orderId: string, client?: InventoryClient): Promise<void> {
  const run = async (tx: InventoryClient) => {
    const reservations = await tx.stockReservation.findMany({ where: { orderId } });
    for (const reservation of reservations) {
      const claimed = await tx.stockReservation.updateMany({
        where: { id: reservation.id, status: "COMMITTED" },
        data: { status: "RELEASED" },
      });
      if (claimed.count !== 1) continue;
      await tx.variant.update({
        where: { id: reservation.variantId },
        data: { stock: { increment: reservation.qty } },
      });
    }
  };
  if (client) await run(client);
  else await db().$transaction((tx) => run(tx));
}

export function recordOrderEvent(
  input: {
    orderId: string;
    dimension: $Enums.OrderEventDimension;
    from: string;
    to: string;
    actor: string;
    note?: string;
  },
  client?: Pick<Prisma.TransactionClient, "orderStatusEvent">,
) {
  return (client ?? db()).orderStatusEvent.create({ data: input });
}

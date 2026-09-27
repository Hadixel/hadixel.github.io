// The stock lifecycle, in one place, with one set of guarantees.
//
//   reserve (place) -> commit (paid) -> release (fail / expire / cancel while awaiting)
//   restock (cancel / refund of a committed order)
//
// This module used to exist twice — once per app — and the two copies disagreed. The storefront's
// copy had no transaction and no claim step, so a repeated payment callback drove reserved stock
// negative and a released reservation was added back to stock that was never sold. The panel's copy
// was correct. What lives here is the correct one, generalised, and the tests beside it are what
// "correct" is written down as.
//
// Every mutation runs in one transaction, and every one of them claims its reservation first with
// a conditional update. The claim is what makes the operations idempotent: a second caller finds
// nothing to claim and does nothing. It is deliberately not a read-then-write — the claim and the
// variant update happen inside the same transaction, and the claim's WHERE clause is the guard.

// These name a generated path directly, which §8 asks us not to do. It is a deliberate, counted
// exception: the index re-exports this module, so importing through it would make the data tier
// import itself, and §2's answer to a cycle is a missing module rather than an exception — but the
// module graph here is sound, and the invariant is scoped in scripts/audit.sh to what it protects,
// which is a consumer reaching past the index. See that script's "Data tier" section.
//
// Extensionless, like every other import in this package: the consuming bundler does not map a
// .js specifier onto the .ts source, so `./client.js` type-checks and then fails to build.
import { OrderEventDimension, PaymentMethod, ReservationStatus } from "../generated/prisma/enums";
import type { Prisma } from "../generated/prisma/client";
import { db } from "../prisma/client";
import { settingKeys } from "@kmodern/schema/setting-keys";

type InventoryClient = Pick<Prisma.TransactionClient, "variant" | "stockReservation" | "setting">;

export type StockLine = {
  variantId: string;
  qty: number;
  allowBackorder?: boolean;
};

/**
 * How long a reservation is held. Callers may override it; otherwise the merchant's setting is
 * read once, so every line of an order expires together rather than drifting by milliseconds.
 */
export type ReserveWindow = {
  checkoutOnlineReserveMinutes?: number;
  checkoutC2cReserveHours?: number;
  /** An absolute expiry, when the caller has already decided one (a hold tied to an invoice). */
  expiresAt?: Date;
};

const DEFAULT_ONLINE_RESERVE_MINUTES = 30;
const DEFAULT_C2C_RESERVE_HOURS = 48;

async function readNumber(client: InventoryClient, key: string, fallback: number): Promise<number> {
  const row = await client.setting.findUnique({ where: { key } });
  const value = row?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function resolveExpiry(
  client: InventoryClient,
  paymentMethod: PaymentMethod,
  window?: ReserveWindow,
): Promise<Date> {
  if (window?.expiresAt) return window.expiresAt;
  if (paymentMethod === PaymentMethod.ONLINE) {
    const minutes =
      window?.checkoutOnlineReserveMinutes ??
      (await readNumber(
        client,
        settingKeys.checkoutOnlineReserveMinutes,
        DEFAULT_ONLINE_RESERVE_MINUTES,
      ));
    return new Date(Date.now() + minutes * 60_000);
  }
  const hours =
    window?.checkoutC2cReserveHours ??
    (await readNumber(client, settingKeys.checkoutC2cReserveHours, DEFAULT_C2C_RESERVE_HOURS));
  return new Date(Date.now() + hours * 3_600_000);
}

async function reserveInClient(
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
    // Compare-and-set: the hold is only taken if the variant has not moved underneath us. Losing
    // this race is not a failure to retry — it means another order took the stock first.
    const updated = await client.variant.updateMany({
      where: { id: line.variantId, stock: variant.stock, reserved: variant.reserved },
      data: { reserved: { increment: line.qty } },
    });
    if (updated.count !== 1) throw new Error(`STOCK_CHANGED:${line.variantId}`);
    await client.stockReservation.create({
      data: {
        orderId,
        variantId: line.variantId,
        qty: line.qty,
        status: ReservationStatus.ACTIVE,
        expiresAt,
      },
    });
  }
}

/**
 * Reserve stock when an order is placed. Every payment method is held; only the window differs.
 * Accepts an existing client so a caller can compose this into a wider transaction.
 */
export async function reserveStock(
  orderId: string,
  lines: StockLine[],
  paymentMethod: PaymentMethod,
  window?: ReserveWindow,
  client?: InventoryClient,
): Promise<void> {
  const run = async (tx: InventoryClient) => {
    const expiresAt = await resolveExpiry(tx, paymentMethod, window);
    await reserveInClient(tx, orderId, lines, expiresAt);
  };
  if (client) await run(client);
  else await db().$transaction((tx) => run(tx));
}

/**
 * Commit on payment: a hold becomes sold.
 *
 * Idempotent for a repeat: a reservation that is already COMMITTED is skipped, so a duplicate
 * callback does not double-decrement. But a reservation that was RELEASED or EXPIRED is a
 * different situation and is refused: the hold is gone, so taking the stock would sell inventory
 * nobody is holding, and restock will not return it either — the order would be marked paid with
 * the stock still on the shelf and the unit permanently oversold. Failing loudly here is what lets
 * the caller refuse the payment instead of recording a paid order it cannot fulfil.
 */
export async function commitStock(orderId: string, client?: InventoryClient): Promise<void> {
  const run = async (tx: InventoryClient) => {
    const reservations = await tx.stockReservation.findMany({ where: { orderId } });
    for (const reservation of reservations) {
      const claimed = await tx.stockReservation.updateMany({
        where: { id: reservation.id, status: ReservationStatus.ACTIVE },
        data: { status: ReservationStatus.COMMITTED },
      });
      if (claimed.count !== 1) {
        // The claim failed, so someone else got there first — but the row we read a moment ago is
        // stale, and deciding from it is how a losing racer mistakes a win for a lost hold. Re-read
        // inside this transaction: READ COMMITTED means we now see whoever won.
        const current = await tx.stockReservation.findUniqueOrThrow({
          where: { id: reservation.id },
        });
        if (current.status === ReservationStatus.COMMITTED) continue; // a legitimate repeat
        throw new Error(`STOCK_HOLD_LOST:${reservation.variantId}`);
      }
      await tx.variant.update({
        where: { id: reservation.variantId },
        data: {
          stock: { decrement: reservation.qty },
          reserved: { decrement: reservation.qty },
        },
      });
    }
  };
  if (client) await run(client);
  else await db().$transaction((tx) => run(tx));
}

/** Release an unpaid order's hold. Idempotent, and it never touches stock that was sold. */
export async function releaseStock(orderId: string, client?: InventoryClient): Promise<void> {
  const run = async (tx: InventoryClient) => {
    const reservations = await tx.stockReservation.findMany({ where: { orderId } });
    for (const reservation of reservations) {
      const claimed = await tx.stockReservation.updateMany({
        where: { id: reservation.id, status: ReservationStatus.ACTIVE },
        data: { status: ReservationStatus.RELEASED },
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

/**
 * Return sold stock after cancelling or refunding a paid order. Only a COMMITTED reservation goes
 * back to stock: one that was released was never sold, and adding it back would invent inventory.
 */
export async function restock(orderId: string, client?: InventoryClient): Promise<void> {
  const run = async (tx: InventoryClient) => {
    const reservations = await tx.stockReservation.findMany({ where: { orderId } });
    for (const reservation of reservations) {
      const claimed = await tx.stockReservation.updateMany({
        where: { id: reservation.id, status: ReservationStatus.COMMITTED },
        data: { status: ReservationStatus.RELEASED },
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

export type OrderEventInput = {
  orderId: string;
  dimension: OrderEventDimension;
  from: string;
  to: string;
  actor: string;
  note?: string;
};

/** One audit line for an order status change, written wherever the change is applied. */
export function recordOrderEvent(
  input: OrderEventInput,
  client?: Pick<Prisma.TransactionClient, "orderStatusEvent">,
) {
  return (client ?? db()).orderStatusEvent.create({ data: input });
}

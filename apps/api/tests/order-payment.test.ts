// Payment settlement, against a real database.
//
// The defect this pins. The storefront's callback used to do three things in sequence with no
// transaction between them: commit the stock, write `paymentStatus`, record the event. A duplicate
// callback arriving while the first was still running could therefore interleave — commit the held
// stock on one path while the other released it — and the failure path released stock with no
// condition at all, so a callback that lost a race could release the stock of an order that had
// already been paid for.
//
// What is asserted here is not that the status ends up PAID. It is that a settlement happens at
// most once, that stock only ever moves when this call won the right to move it, and that the whole
// thing is one transaction rather than three writes that happen to run in order.

import { beforeEach, describe, expect, it } from "vitest";
import { reserveStock } from "../src/inventory/inventory.service.js";
import { OrdersService } from "../src/orders/orders.service.js";
import { $Enums, db } from "../src/prisma/index.js";
import { makeOrder, makeVariant, readVariant, resetDatabase } from "./harness.js";

const ONLINE = $Enums.PaymentMethod.ONLINE;
const PaymentStatus = $Enums.PaymentStatus;
const ReservationStatus = $Enums.ReservationStatus;

function service(): OrdersService {
  return new OrdersService(db() as never);
}

/** An order with stock held against it, which is the state a payment callback arrives into. */
async function awaitingOrderWithStock(qty = 2) {
  const order = await makeOrder();
  const variant = await makeVariant({ stock: 10 });
  await reserveStock(order.id, [{ variantId: variant.id, qty }], ONLINE);
  return { order, variant };
}

async function paymentStatusOf(orderId: string): Promise<string> {
  return (await db().order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus;
}

async function reservationStatuses(orderId: string): Promise<string[]> {
  const rows = await db().stockReservation.findMany({ where: { orderId }, orderBy: { id: "asc" } });
  return rows.map((r) => r.status);
}

async function events(orderId: string) {
  return db().orderStatusEvent.findMany({ where: { orderId }, orderBy: { at: "asc" } });
}

describe("settling a payment", () => {
  beforeEach(resetDatabase);

  it("marks the order paid, commits the held stock, and records the change — as one transaction", async () => {
    const { order, variant } = await awaitingOrderWithStock(2);

    const result = await service().settlePayment({
      orderId: order.id,
      outcome: "PAID",
      refId: "REF-1",
      actor: "SYSTEM",
    });

    expect(result.kind).toBe("settled");
    expect(await paymentStatusOf(order.id)).toBe(PaymentStatus.PAID);
    // The hold becomes sold: stock down by the quantity, nothing left reserved.
    expect(await readVariant(variant.id)).toEqual({ stock: 8, reserved: 0 });
    expect(await reservationStatuses(order.id)).toEqual([ReservationStatus.COMMITTED]);

    const written = await events(order.id);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      dimension: "PAYMENT",
      from: "AWAITING",
      to: "PAID",
      actor: "SYSTEM",
    });
  });

  it("records the gateway's reference so a later refund can find the payment", async () => {
    const { order } = await awaitingOrderWithStock();

    await service().settlePayment({ orderId: order.id, outcome: "PAID", refId: "REF-77", actor: "SYSTEM" });

    const stored = await db().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.gatewayRefId).toBe("REF-77");
  });

  it("releases the hold and marks the order failed when the shopper cancels", async () => {
    const { order, variant } = await awaitingOrderWithStock(3);

    const result = await service().settlePayment({ orderId: order.id, outcome: "FAILED", actor: "SYSTEM" });

    expect(result.kind).toBe("settled");
    expect(await paymentStatusOf(order.id)).toBe(PaymentStatus.FAILED);
    // Released, not sold: the units go back on the shelf and stay sellable.
    expect(await readVariant(variant.id)).toEqual({ stock: 10, reserved: 0 });
    expect(await reservationStatuses(order.id)).toEqual([ReservationStatus.RELEASED]);
  });

  // The criterion the ticket names. Two callbacks for the same authority, driven at the same time.
  it("applies a settlement at most once when the same callback arrives twice", async () => {
    const { order } = await awaitingOrderWithStock(2);

    const [first, second] = await Promise.all([
      service().settlePayment({ orderId: order.id, outcome: "PAID", refId: "REF-2", actor: "SYSTEM" }),
      service().settlePayment({ orderId: order.id, outcome: "PAID", refId: "REF-2", actor: "SYSTEM" }),
    ]);

    // Exactly one of them did the work. The other found the order already settled and said so.
    expect([first.kind, second.kind].sort()).toEqual(["already", "settled"]);
    // One settlement means one event, not two audit lines for one payment.
    expect(await events(order.id)).toHaveLength(1);
  });

  it("commits the stock once when the same callback arrives twice", async () => {
    const { order, variant } = await awaitingOrderWithStock(2);

    await Promise.all([
      service().settlePayment({ orderId: order.id, outcome: "PAID", actor: "SYSTEM" }),
      service().settlePayment({ orderId: order.id, outcome: "PAID", actor: "SYSTEM" }),
    ]);

    // 10 - 2, not 10 - 4. A double commit is what drove reserved stock negative before.
    expect(await readVariant(variant.id)).toEqual({ stock: 8, reserved: 0 });
  });

  // The specific interleaving the ticket describes: a success and a cancellation of the same order.
  it("never releases the stock of an order that has already been paid for", async () => {
    const { order, variant } = await awaitingOrderWithStock(2);

    await service().settlePayment({ orderId: order.id, outcome: "PAID", actor: "SYSTEM" });
    // A late callback for the same order reporting a failure — the shape that used to release stock
    // unconditionally, taking a paid order's units off the shelf.
    const late = await service().settlePayment({ orderId: order.id, outcome: "FAILED", actor: "SYSTEM" });

    expect(late.kind).toBe("conflict");
    expect(await paymentStatusOf(order.id)).toBe(PaymentStatus.PAID);
    // The paid order keeps its sold stock, and the hold stays committed rather than being released.
    expect(await readVariant(variant.id)).toEqual({ stock: 8, reserved: 0 });
    expect(await reservationStatuses(order.id)).toEqual([ReservationStatus.COMMITTED]);
  });

  it("reports a repeat of the same outcome as already settled rather than as a failure", async () => {
    const { order } = await awaitingOrderWithStock();

    await service().settlePayment({ orderId: order.id, outcome: "FAILED", actor: "SYSTEM" });
    const repeat = await service().settlePayment({ orderId: order.id, outcome: "FAILED", actor: "SYSTEM" });

    expect(repeat.kind).toBe("already");
    expect(await events(order.id)).toHaveLength(1);
  });

  it("refuses to settle an order that is not awaiting payment", async () => {
    const { order } = await awaitingOrderWithStock();
    await db().order.update({ where: { id: order.id }, data: { paymentStatus: PaymentStatus.REFUNDED } });

    const result = await service().settlePayment({ orderId: order.id, outcome: "PAID", actor: "SYSTEM" });

    expect(result.kind).toBe("conflict");
    expect(await events(order.id)).toHaveLength(0);
  });

  it("reports an absent order rather than settling nothing", async () => {
    const result = await service().settlePayment({ orderId: "no-such-order", outcome: "PAID", actor: "SYSTEM" });

    expect(result.kind).toBe("not-found");
  });

  // If the hold is gone the payment must not be recorded: an order marked paid whose stock nobody is
  // holding is oversold, and restock will not bring it back.
  it("leaves the order unpaid when its hold has already gone", async () => {
    const { order, variant } = await awaitingOrderWithStock(2);
    await db().stockReservation.updateMany({
      where: { orderId: order.id },
      data: { status: ReservationStatus.RELEASED },
    });

    const result = await service().settlePayment({ orderId: order.id, outcome: "PAID", actor: "SYSTEM" });

    expect(result.kind).toBe("hold-lost");
    // The whole settlement rolled back, so the status write did not survive either.
    expect(await paymentStatusOf(order.id)).toBe(PaymentStatus.AWAITING);
    expect(await readVariant(variant.id)).toEqual({ stock: 10, reserved: 2 });
  });
});

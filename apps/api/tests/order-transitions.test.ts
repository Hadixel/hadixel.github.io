// Order status transitions, and the reads that go with them.
//
// Two rules are pinned here, and both used to be enforced by two copies of the same table:
//
// - the server accepts exactly the transitions the panel offers, because the panel is rendered from
//   what the server says it accepts;
// - a shopper reads their own orders and nobody else's, with the scoping in the query rather than in a
//   decision made after the row is fetched.

import { beforeEach, describe, expect, it } from "vitest";
import { reserveStock } from "../src/inventory/inventory.service.js";
import { allowedTransitions, isAllowedTransition, stockEffectFor, FULFILLMENT_NEXT, PAYMENT_NEXT } from "../src/orders/order-transitions.js";
import { OrdersService } from "../src/orders/orders.service.js";
import { $Enums, db } from "../src/prisma/index.js";
import { makeOrder, makeProduct, makeVariant, readVariant, resetDatabase } from "./harness.js";

const ONLINE = $Enums.PaymentMethod.ONLINE;
const ReservationStatus = $Enums.ReservationStatus;

function service(): OrdersService {
  return new OrdersService(db() as never);
}

describe("the transition table", () => {
  it("offers nothing from a terminal state", () => {
    for (const terminal of ["CANCELLED", "RETURNED"]) {
      expect(allowedTransitions("FULFILLMENT", terminal)).toEqual([]);
    }
    expect(allowedTransitions("PAYMENT", "REFUNDED")).toEqual([]);
  });

  it("walks an order from placed to delivered without a jump", () => {
    // The first offered step each time, followed to the end. A table that let an order skip a step
    // would show up here as a shorter walk, because a state whose first option were further along
    // would skip the intermediate one.
    let state = "PENDING";
    const walked: string[] = [state];
    for (let step = 0; step < 4; step += 1) {
      const [next] = allowedTransitions("FULFILLMENT", state);
      if (!next) break;
      state = next;
      walked.push(state);
    }
    expect(walked).toEqual(["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"]);
  });

  it("does not let a status skip ahead of the step before it", () => {
    expect(isAllowedTransition("FULFILLMENT", "PENDING", "SHIPPED")).toBe(false);
    expect(isAllowedTransition("FULFILLMENT", "PENDING", "DELIVERED")).toBe(false);
  });

  // The property the two byte-identical tables in the panel used to have to keep in step by hand: a
  // status the schema can store must appear in the table, or an order that lands in it has no defined
  // next step and the form renders nothing.
  it("names every enum status the schema can store, so no state is unreachable", () => {
    const fulfillment = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"];
    const payment = ["AWAITING", "PAID", "FAILED", "REFUNDED"];

    for (const status of fulfillment) {
      expect(Object.prototype.hasOwnProperty.call(FULFILLMENT_NEXT, status)).toBe(true);
    }
    for (const status of payment) {
      expect(Object.prototype.hasOwnProperty.call(PAYMENT_NEXT, status)).toBe(true);
    }
  });

  it("moves stock in the direction the transition implies", () => {
    expect(stockEffectFor("PAYMENT", "PAID", "AWAITING")).toBe("commit");
    expect(stockEffectFor("PAYMENT", "FAILED", "AWAITING")).toBe("release");
    expect(stockEffectFor("PAYMENT", "REFUNDED", "PAID")).toBe("restock");
  });

  it("restocks a cancellation of a paid order and only releases the hold of an unpaid one", () => {
    // The same operator action, on two orders in different payment states. Deciding this per call site
    // is how one side committed where the other released.
    expect(stockEffectFor("FULFILLMENT", "CANCELLED", "PAID")).toBe("restock");
    expect(stockEffectFor("FULFILLMENT", "CANCELLED", "AWAITING")).toBe("release");
  });
});

describe("moving an order's status", () => {
  beforeEach(resetDatabase);

  it("applies a transition the table allows, and records it", async () => {
    const order = await makeOrder();

    const result = await service().setStatus({
      orderId: order.id,
      dimension: "FULFILLMENT",
      to: "CONFIRMED",
      actor: "admin@test",
    });

    expect(result).toEqual({ ok: true, from: "PENDING" });
    const stored = await db().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.fulfillmentStatus).toBe("CONFIRMED");
    const events = await db().orderStatusEvent.findMany({ where: { orderId: order.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ from: "PENDING", to: "CONFIRMED", actor: "admin@test" });
  });

  it("refuses a transition the table does not allow", async () => {
    const order = await makeOrder();

    const result = await service().setStatus({
      orderId: order.id,
      dimension: "FULFILLMENT",
      to: "DELIVERED",
      actor: "admin@test",
    });

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    const stored = await db().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.fulfillmentStatus).toBe("PENDING");
  });

  it("commits the hold when an awaiting order is marked paid by an operator", async () => {
    const order = await makeOrder();
    const variant = await makeVariant({ stock: 5 });
    await reserveStock(order.id, [{ variantId: variant.id, qty: 2 }], ONLINE);

    await service().setStatus({ orderId: order.id, dimension: "PAYMENT", to: "PAID", actor: "admin@test" });

    expect(await readVariant(variant.id)).toEqual({ stock: 3, reserved: 0 });
  });

  it("restocks when a paid order is cancelled, rather than only releasing a hold", async () => {
    const order = await makeOrder();
    const variant = await makeVariant({ stock: 5 });
    await reserveStock(order.id, [{ variantId: variant.id, qty: 2 }], ONLINE);
    // The order has to actually be paid for this to be the interesting case. Committing the hold
    // without moving the payment status is not a paid order, and a cancellation of one of those
    // should release rather than restock — which is the rule this test is contrasting.
    await service().setStatus({ orderId: order.id, dimension: "PAYMENT", to: "PAID", actor: "admin@test" });
    expect(await readVariant(variant.id)).toEqual({ stock: 3, reserved: 0 });

    await service().setStatus({ orderId: order.id, dimension: "FULFILLMENT", to: "CANCELLED", actor: "admin@test" });

    // 5 - 2 sold, then the cancellation puts the 2 back.
    expect(await readVariant(variant.id)).toEqual({ stock: 5, reserved: 0 });
    const reservations = await db().stockReservation.findMany({ where: { orderId: order.id } });
    expect(reservations[0].status).toBe(ReservationStatus.RELEASED);
  });

  it("only releases the hold when an unpaid order is cancelled", async () => {
    const order = await makeOrder();
    const variant = await makeVariant({ stock: 5 });
    await reserveStock(order.id, [{ variantId: variant.id, qty: 2 }], ONLINE);

    await service().setStatus({ orderId: order.id, dimension: "FULFILLMENT", to: "CANCELLED", actor: "admin@test" });

    // Never sold, so nothing goes back on the shelf — the units were only being held.
    expect(await readVariant(variant.id)).toEqual({ stock: 5, reserved: 0 });
  });

  it("applies the same transition once when the form is submitted twice", async () => {
    const order = await makeOrder();
    const variant = await makeVariant({ stock: 5 });
    await reserveStock(order.id, [{ variantId: variant.id, qty: 2 }], ONLINE);

    const [first, second] = await Promise.all([
      service().setStatus({ orderId: order.id, dimension: "PAYMENT", to: "PAID", actor: "admin@test" }),
      service().setStatus({ orderId: order.id, dimension: "PAYMENT", to: "PAID", actor: "admin@test" }),
    ]);

    // One applied it; the other found the order already PAID, which the table does not allow from PAID.
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    expect(await readVariant(variant.id)).toEqual({ stock: 3, reserved: 0 });
  });

  it("reports an absent order rather than pretending a transition happened", async () => {
    const result = await service().setStatus({
      orderId: "nope",
      dimension: "FULFILLMENT",
      to: "CONFIRMED",
      actor: "admin@test",
    });
    expect(result).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("reading orders", () => {
  beforeEach(resetDatabase);

  it("gives a shopper their own order", async () => {
    const order = await makeOrder();
    const customerId = (await db().order.findUniqueOrThrow({ where: { id: order.id } })).customerId;

    const detail = await service().readOrderForCustomer(order.id, customerId);

    expect(detail?.orderNumber).toBe(order.orderNumber);
  });

  // The capability that must never be client-controlled.
  it("does not give a shopper somebody else's order", async () => {
    const order = await makeOrder();
    const other = await makeOrder();

    const detail = await service().readOrderForCustomer(
      order.id,
      (await db().order.findUniqueOrThrow({ where: { id: other.id } })).customerId,
    );

    expect(detail).toBeNull();
  });

  it("answers a missing order the same way as someone else's", async () => {
    const order = await makeOrder();
    const wrongOwner = await service().readOrderForCustomer(order.id, "no-such-customer");
    const missing = await service().readOrderForCustomer("no-such-order", "no-such-customer");
    expect(wrongOwner).toBeNull();
    expect(missing).toBeNull();
  });

  it("carries the transitions the server accepts, so a form cannot offer one it would refuse", async () => {
    const order = await makeOrder();

    const detail = await service().readOrderForAdmin(order.id);

    expect(detail?.transitions).toEqual({
      fulfillment: ["CONFIRMED", "CANCELLED"],
      payment: ["PAID", "FAILED"],
    });
  });

  it("labels statuses in Persian rather than sending the enum to be translated twice", async () => {
    const order = await makeOrder();

    const detail = await service().readOrderForAdmin(order.id);

    expect(detail?.fulfillmentLabel).toBe("در انتظار");
    expect(detail?.paymentLabel).toBe("در انتظار پرداخت");
  });

  it("pages a long history rather than returning every order at once", async () => {
    const first = await makeOrder();
    // The same shopper's second order — a history is a per-customer read, so both rows have to belong
    // to one customer for this to be a history at all.
    const second = await makeOrder({ customerId: first.customerId });
    await db().order.update({ where: { id: first.id }, data: { placedAt: new Date("2026-01-01") } });
    await db().order.update({ where: { id: second.id }, data: { placedAt: new Date("2026-02-01") } });

    const page = await service().listOrdersForCustomer(first.customerId, { limit: 1, offset: 0 });

    expect(page.total).toBe(2);
    expect(page.orders).toHaveLength(1);
    // Newest first, so the order a shopper just placed is the one on top.
    expect(page.orders[0].orderNumber).toBe(second.orderNumber);
  });

  it("counts the units on an order, not the number of rows describing it", async () => {
    const order = await makeOrder();
    const product = await makeProduct({ name: "یخسال" });
    const variant = await makeVariant({ stock: 10 });
    await db().orderItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        variantId: variant.id,
        productName: "یخسال",
        sku: "S1",
        unitPrice: 1000,
        quantity: 3,
        lineTotal: 3000,
      },
    });

    const detail = await service().readOrderForAdmin(order.id);

    expect(detail?.itemCount).toBe(3);
  });
});

describe("the amount sent to the payment gateway", () => {
  beforeEach(resetDatabase);

  it("converts the order's total with the shared conversion, not a multiplication at the call site", async () => {
    const order = await makeOrder();
    await db().order.update({ where: { id: order.id }, data: { total: 123_456 } });

    const amount = await service().paymentAmountFor(order.id);

    // TOMAN in, Rial out, via the one function both sides of the boundary call.
    expect(amount?.amountRial).toBe(1_234_560);
  });

  it("rounds, because a fractional Rial amount is not something the gateway accepts", async () => {
    const order = await makeOrder();
    await db().order.update({ where: { id: order.id }, data: { total: 1000.05 } });

    const amount = await service().paymentAmountFor(order.id);

    expect(amount?.amountRial).toBe(10_001);
  });
});

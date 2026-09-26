// The stock lifecycle has one implementation and one set of guarantees, and these tests are what
// those guarantees are written down as. They are written against the rules, not against the code:
// each of them fails against an implementation that lacks a transaction or a compare-and-set, and
// that is the point — the two app-local copies this replaces had different answers to all of them.

import { beforeEach, describe, expect, it } from "vitest";
import { commitStock, releaseStock, reserveStock, restock } from "../src/inventory.js";
import { $Enums, db } from "../src/index.js";
import { makeOrder, makeVariant, readVariant, resetDatabase } from "./harness.js";

const ONLINE = $Enums.PaymentMethod.ONLINE;

describe("stock lifecycle", () => {
  beforeEach(resetDatabase);

  describe("reserve", () => {
    it("holds stock against the order without changing what is sellable", async () => {
      const order = await makeOrder();
      const variant = await makeVariant({ stock: 5 });

      await reserveStock(order.id, [{ variantId: variant.id, qty: 2 }], ONLINE);

      expect(await readVariant(variant.id)).toEqual({ stock: 5, reserved: 2 });
    });

    it("refuses to reserve more than is free, and leaves nothing behind", async () => {
      const order = await makeOrder();
      const variant = await makeVariant({ stock: 1 });

      await expect(
        reserveStock(order.id, [{ variantId: variant.id, qty: 3 }], ONLINE),
      ).rejects.toThrow(/INSUFFICIENT_STOCK/);

      // The assertion that matters: a rejected reserve must not have taken anything.
      expect(await readVariant(variant.id)).toEqual({ stock: 1, reserved: 0 });
    });

    it("rejects a non-positive or fractional quantity", async () => {
      const order = await makeOrder();
      const variant = await makeVariant({ stock: 5 });

      await expect(
        reserveStock(order.id, [{ variantId: variant.id, qty: 0 }], ONLINE),
      ).rejects.toThrow(/INVALID_STOCK_QUANTITY/);
      await expect(
        reserveStock(order.id, [{ variantId: variant.id, qty: 1.5 }], ONLINE),
      ).rejects.toThrow(/INVALID_STOCK_QUANTITY/);
    });

    it("allows a backorder line to exceed free stock", async () => {
      const order = await makeOrder();
      const variant = await makeVariant({ stock: 1, allowBackorder: true });

      await reserveStock(
        order.id,
        [{ variantId: variant.id, qty: 4, allowBackorder: true }],
        ONLINE,
      );

      expect(await readVariant(variant.id)).toEqual({ stock: 1, reserved: 4 });
    });

    it("holds an online order for minutes and a cash order for hours", async () => {
      const order = await makeOrder();
      const variant = await makeVariant({ stock: 10 });
      const before = Date.now();

      await reserveStock(order.id, [{ variantId: variant.id, qty: 1 }], ONLINE, {
        checkoutOnlineReserveMinutes: 30,
      });

      const reservation = await db().stockReservation.findFirstOrThrow();
      const minutesOut = (reservation.expiresAt.getTime() - before) / 60_000;
      expect(minutesOut).toBeGreaterThan(29);
      expect(minutesOut).toBeLessThan(31);
    });
  });

  describe("commit", () => {
    it("moves reserved stock into sold stock", async () => {
      const order = await makeOrder();
      const variant = await makeVariant({ stock: 5 });
      await reserveStock(order.id, [{ variantId: variant.id, qty: 2 }], ONLINE);

      await commitStock(order.id);

      expect(await readVariant(variant.id)).toEqual({ stock: 3, reserved: 0 });
    });

    // The regression this ticket exists for: the storefront's copy had no transaction and no
    // claim, so a repeated payment callback drove reserved stock to -4.
    it("cannot be applied twice, however many times it is called", async () => {
      const order = await makeOrder();
      const variant = await makeVariant({ stock: 5 });
      await reserveStock(order.id, [{ variantId: variant.id, qty: 2 }], ONLINE);

      await commitStock(order.id);
      await commitStock(order.id);
      await commitStock(order.id);

      expect(await readVariant(variant.id)).toEqual({ stock: 3, reserved: 0 });
    });

    it("survives two commits racing each other", async () => {
      const order = await makeOrder();
      const variant = await makeVariant({ stock: 5 });
      await reserveStock(order.id, [{ variantId: variant.id, qty: 2 }], ONLINE);

      await Promise.all([commitStock(order.id), commitStock(order.id)]);

      expect(await readVariant(variant.id)).toEqual({ stock: 3, reserved: 0 });
    });

    // A payment arriving after the hold was released — an admin cancelled the awaiting order, or a
    // failed callback the gateway re-sends — used to mark the order paid while taking no stock.
    // The unit was then oversold and restock would not bring it back.
    it("refuses to commit a hold that has already been released", async () => {
      const order = await makeOrder();
      const variant = await makeVariant({ stock: 5 });
      await reserveStock(order.id, [{ variantId: variant.id, qty: 2 }], ONLINE);
      await releaseStock(order.id);

      await expect(commitStock(order.id)).rejects.toThrow(/STOCK_HOLD_LOST/);

      expect(await readVariant(variant.id)).toEqual({ stock: 5, reserved: 0 });
    });
  });

  describe("release", () => {
    it("returns held stock without changing what is sellable", async () => {
      const order = await makeOrder();
      const variant = await makeVariant({ stock: 5 });
      await reserveStock(order.id, [{ variantId: variant.id, qty: 2 }], ONLINE);

      await releaseStock(order.id);

      expect(await readVariant(variant.id)).toEqual({ stock: 5, reserved: 0 });
    });

    it("cannot release twice", async () => {
      const order = await makeOrder();
      const variant = await makeVariant({ stock: 5 });
      await reserveStock(order.id, [{ variantId: variant.id, qty: 2 }], ONLINE);

      await releaseStock(order.id);
      await releaseStock(order.id);

      expect(await readVariant(variant.id)).toEqual({ stock: 5, reserved: 0 });
    });

    it("leaves committed stock alone", async () => {
      const order = await makeOrder();
      const variant = await makeVariant({ stock: 5 });
      await reserveStock(order.id, [{ variantId: variant.id, qty: 2 }], ONLINE);
      await commitStock(order.id);

      await releaseStock(order.id);

      expect(await readVariant(variant.id)).toEqual({ stock: 3, reserved: 0 });
    });
  });

  describe("restock", () => {
    it("returns sold stock after a cancellation of a paid order", async () => {
      const order = await makeOrder();
      const variant = await makeVariant({ stock: 5 });
      await reserveStock(order.id, [{ variantId: variant.id, qty: 2 }], ONLINE);
      await commitStock(order.id);

      await restock(order.id);

      expect(await readVariant(variant.id)).toEqual({ stock: 5, reserved: 0 });
    });

    // The storefront's copy incremented for every reservation regardless of status, so a
    // released (never-paid) reservation was added back on top of stock that was never sold.
    it("cannot restock a reservation that was never sold", async () => {
      const order = await makeOrder();
      const variant = await makeVariant({ stock: 5 });
      await reserveStock(order.id, [{ variantId: variant.id, qty: 2 }], ONLINE);
      await releaseStock(order.id);

      await restock(order.id);

      expect(await readVariant(variant.id)).toEqual({ stock: 5, reserved: 0 });
    });

    it("cannot restock twice", async () => {
      const order = await makeOrder();
      const variant = await makeVariant({ stock: 5 });
      await reserveStock(order.id, [{ variantId: variant.id, qty: 2 }], ONLINE);
      await commitStock(order.id);

      await restock(order.id);
      await restock(order.id);

      expect(await readVariant(variant.id)).toEqual({ stock: 5, reserved: 0 });
    });
  });
});

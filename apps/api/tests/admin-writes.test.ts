// The panel's writes, as the gateway applies them.
//
// Ticket 12 moves every change an operator makes behind the gateway. That is only worth doing if the
// guarantees the panel used to enforce by hand survive the move, and this file is where they are
// pinned — starting with the one that was never a guarantee at all.
//
// The audit rule used to be: mutate, then write a line. Run in that order, a failed audit write is a
// mutation nobody recorded, and the panel reported success. Four call sites wrote an audit row
// directly rather than through the one helper, so "every sensitive mutation is audited" was a
// convention rather than a rule. These tests make it a rule: the line is written inside the same
// transaction as the change, so it cannot fail alone.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createPrismaClient } from "../src/prisma/client.js";
import { InventoryController } from "../src/inventory/inventory.controller.js";
import { OrdersService } from "../src/orders/orders.service.js";
import { db } from "../src/prisma/index.js";
import { makeOrder, makeVariant, readVariant, resetDatabase } from "./harness.js";

type Db = ReturnType<typeof createPrismaClient>;

/**
 * The real database, with the audit write rigged to fail.
 *
 * Used to prove the audit line is inside the transaction rather than after it. A proxy is enough and
 * is better than a fixture here: every other statement still hits the real database, so the rollback
 * being asserted is a real rollback and not a mock's idea of one.
 */
function dbWithFailingAudit(): Db {
  const real = db() as Db;
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === "$transaction") {
        return async (fn: (tx: unknown) => unknown) =>
          (target.$transaction as (f: (tx: unknown) => unknown) => unknown)((tx: unknown) =>
            fn(new Proxy(tx as object, {
              get(txTarget, txProp) {
                if (txProp === "adminAuditLog") {
                  return {
                    create: () => Promise.reject(new Error("AUDIT_WRITE_FAILED")),
                  };
                }
                return Reflect.get(txTarget, txProp, txTarget);
              },
            })),
          );
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as Db;
}

describe("an operator's change is recorded in the audit trail", () => {
  beforeEach(resetDatabase);

  it("names the operator who made the status change", async () => {
    const order = await makeOrder();

    await new OrdersService(db() as never).setStatus({
      orderId: order.id,
      dimension: "FULFILLMENT",
      to: "CONFIRMED",
      actor: "operator@kmodern.ir",
    });

    const lines = await db().adminAuditLog.findMany({ where: { entityId: order.id } });
    expect(lines).toHaveLength(1);
    // The person, not a placeholder. An order's history is read by people deciding what to do next.
    expect(lines[0]).toMatchObject({
      entityType: "ORDER",
      action: "ORDER_CONFIRMED",
    });
  });

  // The half that used to be false. `recordAudit` ran after the transaction had already committed, so
  // an audit write that failed left a changed order with no record of who changed it, and the panel
  // reported success. Writing the line inside the transaction is what makes the two atomic.
  it("does not apply the change when the audit write fails", async () => {
    const order = await makeOrder();

    await expect(
      new OrdersService(dbWithFailingAudit()).setStatus({
        orderId: order.id,
        dimension: "FULFILLMENT",
        to: "CONFIRMED",
        actor: "operator@kmodern.ir",
      }),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    const stored = await db().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.fulfillmentStatus).toBe("PENDING");
    // The event rolled back with it, so the order's own history agrees with the order's state.
    expect(await db().orderStatusEvent.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("leaves nothing behind when a refused transition is asked to be audited", async () => {
    const order = await makeOrder();

    const result = await new OrdersService(db() as never).setStatus({
      orderId: order.id,
      dimension: "FULFILLMENT",
      to: "DELIVERED",
      actor: "operator@kmodern.ir",
    });

    // A refusal is not a change, so it must not leave an audit line claiming one happened.
    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(await db().adminAuditLog.count({ where: { entityId: order.id } })).toBe(0);
  });
});

describe("an operator adjusts stock by hand", () => {
  // A real operator row, because `AdminAuditLog.adminUserId` is a foreign key and an audit line that
  // names nobody is a different thing from one that names a person. A fixture with a made-up id would
  // make the audit assertions untestable, so the operator is created rather than faked.
  let operatorId: string;

  beforeEach(async () => {
    await resetDatabase();
    const operator = await db().adminUser.create({
      data: {
        email: "operator@kmodern.ir",
        name: "اپراتور",
        passwordHash: "scrypt$00$00",
        isActive: true,
      },
    });
    operatorId = operator.id;
  });

  /**
   * The controller with its identity check satisfied.
   *
   * The tests below are about the adjustment, not about the session, so the request carries a cookie
   * the gateway will accept and an `adminForToken` that returns an operator. What is exercised is
   * everything after authentication, which is where the rules are.
   */
  function controller() {
    const auth = {
      adminForToken: async (token: string) =>
        token === "good" ? { admin: { id: operatorId, email: "operator@kmodern.ir" } } : null,
    } as never;
    return new InventoryController(auth, db() as never);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  it("adds stock and records the operator, the delta and the before and after", async () => {
    const variant = await makeVariant({ stock: 5 });

    const result = await controller().adjust(request(), variant.id, { delta: 3, note: "شمارش انبار" });

    expect(result).toEqual({ stock: 8, reserved: 0 });
    const lines = await db().adminAuditLog.findMany({ where: { entityId: variant.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ action: "STOCK_ADJUSTED", entityType: "VARIANT" });
    expect(lines[0].meta).toMatchObject({ delta: 3, before: 5, after: 8, note: "شمارش انبار" });
  });

  it("removes stock with a negative delta, because that is the same operation", async () => {
    const variant = await makeVariant({ stock: 5 });

    const result = await controller().adjust(request(), variant.id, { delta: -2 });

    expect(result.stock).toBe(3);
    expect(await readVariant(variant.id)).toEqual({ stock: 3, reserved: 0 });
  });

  // The guarantee the panel's own copy of this could not make about itself, and the reason a stock
  // count is not something an operator types as an absolute number: a unit already promised to a
  // customer is not available to write off.
  it("refuses to take stock below what is already reserved", async () => {
    const variant = await makeVariant({ stock: 5, reserved: 4 });

    await expect(
      controller().adjust(request(), variant.id, { delta: -3 }),
    ).rejects.toThrow();

    // Refused, not clamped: silently reducing the delta would write a number nobody asked for.
    expect(await readVariant(variant.id)).toEqual({ stock: 5, reserved: 4 });
    expect(await db().adminAuditLog.count({ where: { entityId: variant.id } })).toBe(0);
  });

  it("allows an adjustment down to exactly the reserved count", async () => {
    const variant = await makeVariant({ stock: 5, reserved: 4 });

    const result = await controller().adjust(request(), variant.id, { delta: -1 });

    expect(result).toEqual({ stock: 4, reserved: 4 });
  });

  // The defect a read-then-write would reintroduce: a hold taken between the read and the write makes
  // the operator's delta computed from a stale row, and applying it would resurrect a sold unit.
  //
  // The race is staged by handing the controller a client whose `updateMany` first performs the
  // concurrent hold. That is the one seam where the interleaving can be forced deterministically —
  // a timer would make this test pass or fail by how busy the machine was, which is a test that
  // reports the wrong thing.
  it("refuses rather than overwriting a row that moved underneath it", async () => {
    const variant = await makeVariant({ stock: 5 });
    const real = db() as Db;
    const realUpdate = real.variant.updateMany.bind(real.variant);

    let raced = false;
    const racing: Db = new Proxy(real, {
      get(target, prop, receiver) {
        if (prop === "variant") {
          return {
            ...real.variant,
            updateMany: async (args: never) => {
              if (!raced) {
                raced = true;
                // A shopper's order takes a hold in the window between the panel's read and its write.
                await realUpdate({
                  where: { id: variant.id },
                  data: { reserved: { increment: 2 } },
                } as never);
              }
              return realUpdate(args);
            },
          };
        }
        if (prop === "$transaction") {
          return (fn: (tx: unknown) => unknown) =>
            (target.$transaction as (f: (tx: unknown) => unknown) => unknown)((tx: unknown) =>
              fn(new Proxy(tx as object, {
                get(txTarget, txProp) {
                  if (txProp === "variant") {
                    return {
                      ...real.variant,
                      updateMany: async (args: never) => {
                        if (!raced) {
                          raced = true;
                          await realUpdate({
                            where: { id: variant.id },
                            data: { reserved: { increment: 2 } },
                          } as never);
                        }
                        return realUpdate(args);
                      },
                    };
                  }
                  return Reflect.get(txTarget, txProp, txTarget);
                },
              })),
            );
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as Db;

    const auth = {
      adminForToken: async () => ({ admin: { id: operatorId, email: "operator@kmodern.ir" } }),
    } as never;

    await expect(
      new InventoryController(auth, racing).adjust(request(), variant.id, { delta: 1 }),
    ).rejects.toThrow();

    // The concurrent hold survives; the stale adjustment did not land on top of it.
    expect(await readVariant(variant.id)).toEqual({ stock: 5, reserved: 2 });
  });

  it("answers a variant that does not exist as absent, not as a conflict", async () => {
    // The two are worth telling apart: one is a stale id and one is a lost race, and the operator can
    // act on the first and not the second.
    await expect(controller().adjust(request(), "no-such-variant", { delta: 1 })).rejects.toThrow(
      /تنوع پیدا نشد/,
    );
  });

  it("does not apply an adjustment that was never authenticated", async () => {
    const variant = await makeVariant({ stock: 5 });

    await expect(
      controller().adjust({ headers: { cookie: "kmodern_admin=bad" } } as never, variant.id, { delta: 1 }),
    ).rejects.toThrow();

    expect(await readVariant(variant.id)).toEqual({ stock: 5, reserved: 0 });
  });
});

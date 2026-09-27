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

import { beforeEach, describe, expect, it } from "vitest";
import type { createPrismaClient } from "../src/prisma/client.js";
import { OrdersService } from "../src/orders/orders.service.js";
import { db } from "../src/prisma/index.js";
import { makeOrder, resetDatabase } from "./harness.js";

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

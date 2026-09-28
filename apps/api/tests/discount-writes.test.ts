// The panel's discount write, as the gateway applies it.
//
// Discounts were the third feature to move, and the first where the panel's own copy of the rules was
// a *schema* rather than a set of hand-written checks — `discountSchema`, a zod contract with ten
// rules in it, including which percentage is legal, which window is open, and which targets must
// exist. Two things were wrong with that arrangement before the move, and both are what these tests
// pin:
//
//   1. The rules were enforced by the caller. A zod contract in a shared package is a rule a client
//      may call and a client may skip, and the panel was the only caller that mattered.
//   2. The existence check was in the wrong place *and* the wrong shape. The panel counted its
//      targets in a read that happened before the write, so a product deleted in between left a
//      discount naming something that no longer exists — and the till applies such a discount to
//      nothing, silently, because `inScope` only asks whether a cart id appears in the list it was
//      handed.
//
// And one the move could not fix on its own, which is why it is asserted rather than assumed: the
// code column has an ordinary index, not a unique one. `Discount_code_idx` is `CREATE INDEX`, while
// the model's comment claims "unique nullable". So the DTO's canonicalisation is what stops two
// *spellings* of a code becoming two rows, and the duplicate check here is what stops two coupons
// sharing a code at all — asked inside the transaction, because with no unique index there is nothing
// else to ask.

import { beforeEach, describe, expect, it } from "vitest";
import type { createPrismaClient } from "../src/prisma/client.js";
import { DiscountsController } from "../src/discounts/discounts.controller.js";
import { db } from "../src/prisma/index.js";
import { makeCategory, makeDiscount, makeOrder, makeProduct, resetDatabase } from "./harness.js";

type Db = ReturnType<typeof createPrismaClient>;

/**
 * The real database, with the audit write rigged to fail.
 *
 * A proxy rather than a fixture, for the reason `admin-writes.test.ts` gives: every other statement
 * still hits the real database, so the rollback being asserted is a real rollback.
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
                  return { create: () => Promise.reject(new Error("AUDIT_WRITE_FAILED")) };
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

const START = "2026-01-01T00:00:00.000Z";
const LATER = "2026-02-01T00:00:00.000Z";

describe("an operator creates a discount", () => {
  beforeEach(resetDatabase);
  let operatorId: string;

  beforeEach(async () => {
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

  function controller(client: Db = db() as Db) {
    const auth = {
      adminForToken: async (token: string) =>
        token === "good" ? { admin: { id: operatorId, email: "operator@kmodern.ir" } } : null,
    } as never;
    return new DiscountsController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  const body = (over: Record<string, unknown> = {}) => ({
    type: "PERCENT",
    scope: "ALL",
    mode: "AUTOMATIC",
    value: 10,
    startsAt: START,
    ...over,
  });

  it("stores the row and the audit line together", async () => {
    const saved = await controller().create(request(), body() as never);

    const row = await db().discount.findUnique({ where: { id: saved.id } });
    expect(row).toMatchObject({ type: "PERCENT", value: 10, status: "ACTIVE" });

    const lines = await db().adminAuditLog.findMany({ where: { entityId: saved.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ action: "DISCOUNT_CREATED", entityType: "DISCOUNT" });
  });

  it("stores the code in the spelling it will be matched in", async () => {
    // The defect this pins. The checkout reader compares with `trim().toLowerCase()` on both sides, so
    // a code stored as " SUMMER " matched what a shopper typed — while the column kept the spaces. And
    // the column's index is not unique, so "SUMMER" and " summer " were two rows the database
    // considered different and the till served the second one at random. Normalising in the reader
    // cannot fix it: by the time the reader runs, the rows are already distinct.
    const saved = await controller().create(request(), body({ mode: "COUPON", code: "  SUMMER  " }) as never);

    const row = await db().discount.findUnique({ where: { id: saved.id } });
    expect(row?.code).toBe("summer");
  });

  it("makes two spellings of one code the same code, so a second save is refused", async () => {
    // The half of the rule the DTO alone cannot deliver. Canonicalising means the *stored* value is
    // the matched value, and this is the check that acts on it.
    await controller().create(request(), body({ mode: "COUPON", code: "SUMMER" }) as never);

    await expect(
      controller().create(request(), body({ mode: "COUPON", code: "  summer " }) as never),
    ).rejects.toThrow(/قبلاً استفاده شده/);

    expect(await db().discount.count()).toBe(1);
  });

  it("refuses a percentage outside 1..100", async () => {
    for (const value of [0, 101, -5]) {
      await expect(
        controller().create(request(), body({ value }) as never),
        `value ${value}`,
      ).rejects.toThrow(/بین ۱ تا ۱۰۰/);
    }
    expect(await db().discount.count()).toBe(0);
  });

  it("refuses a free-delivery discount that claims to take something off", async () => {
    await expect(
      controller().create(request(), body({ type: "FREE_DELIVERY", value: 5 }) as never),
    ).rejects.toThrow(/ارسال رایگان/);
  });

  it("refuses a coupon with no code", async () => {
    // The panel checked this one itself, against its own copy of the rule.
    await expect(
      controller().create(request(), body({ mode: "COUPON" }) as never),
    ).rejects.toThrow(/کد الزامی/);
  });

  it("refuses a scoped discount that names no targets", async () => {
    // Because the till's `inScope` asks whether any cart id is in the list, an empty list is a
    // discount that can never be true — and the panel's list renders it as a live offer.
    await expect(
      controller().create(request(), body({ scope: "PRODUCTS", productIds: [] }) as never),
    ).rejects.toThrow(/حداقل یک محصول/);
  });

  it("refuses a window that has already closed when it starts", async () => {
    await expect(
      controller().create(request(), body({ startsAt: LATER, endsAt: START }) as never),
    ).rejects.toThrow(/زمان پایان/);
  });

  it("names the targets that are not in the catalogue", async () => {
    const product = await makeProduct();
    await expect(
      controller().create(
        request(),
        body({ scope: "PRODUCTS", productIds: [product.id, "no-such-product"] }) as never,
      ),
    ).rejects.toThrow(/no-such-product/);

    expect(await db().discount.count()).toBe(0);
  });

  it("asks about the targets on the transaction's own client, never on the bare one", async () => {
    // The panel's version counted first and wrote second, in two round trips on the bare client. A
    // product deleted in between left a discount naming something that no longer exists — applied at
    // the till against nothing, silently, because `inScope` only asks whether a cart id is in the
    // list it was handed.
    //
    // Asserted by watching *which client* the existence query goes to, rather than by racing a
    // deletion against a save. A race cannot decide this reliably: the interleaving it needs is the
    // one the scheduler does not choose, and a test that passes or fails by luck is worse than none.
    // This one fails the moment the check moves out of the transaction, and only for that reason.
    const product = await makeProduct();
    const real = db() as Db;
    const outsideTransaction: string[] = [];

    const watching = new Proxy(real, {
      get(target, prop, receiver) {
        // A delegate read off the top-level client is the panel's ordering: the query it returns
        // belongs to no transaction, so nothing can bind its answer to the write that follows.
        if (prop === "product" || prop === "category" || prop === "collection") {
          outsideTransaction.push(String(prop));
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as Db;

    await controller(watching).create(
      request(),
      body({ scope: "PRODUCTS", productIds: [product.id] }) as never,
    );

    expect(outsideTransaction).toEqual([]);
  });

  it("checks the lists the current scope does not read, because they become live on a scope switch", async () => {
    const category = await makeCategory("kitchen", "آشپزخانه");
    // `scope: ALL` reads none of the lists, so a stale id in one of them is invisible today — and a
    // live bad reference the moment the operator switches the scope back to it.
    await controller().create(
      request(),
      body({ scope: "ALL", categoryIds: [category.id] }) as never,
    );

    await expect(
      controller().create(request(), body({ scope: "ALL", categoryIds: ["no-such-category"] }) as never),
    ).rejects.toThrow(/no-such-category/);
  });

  it("does not save anything when the audit write fails", async () => {
    // The panel's helper ran its insert after the commit, so this left a discount nobody could
    // account for and told the operator it had saved.
    await expect(
      controller(dbWithFailingAudit()).create(request(), body() as never),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    expect(await db().discount.count()).toBe(0);
    expect(await db().adminAuditLog.count()).toBe(0);
  });

  it("does not create a discount for an unauthenticated request", async () => {
    await expect(
      controller().create({ headers: { cookie: "kmodern_admin=bad" } } as never, body() as never),
    ).rejects.toThrow();

    expect(await db().discount.count()).toBe(0);
  });
});

describe("an operator edits a discount", () => {
  beforeEach(resetDatabase);
  let operatorId: string;

  beforeEach(async () => {
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

  function controller(client: Db = db() as Db) {
    const auth = {
      adminForToken: async (token: string) =>
        token === "good" ? { admin: { id: operatorId, email: "operator@kmodern.ir" } } : null,
    } as never;
    return new DiscountsController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  it("changes only what the request carried", async () => {
    // Created through the write path so the stored code is canonical: an update canonicalises what it
    // stores, and a fixture's `DISC-n` would be rewritten — correct behaviour, and not what this test
    // is about, which is that a field the request never mentions survives untouched.
    const existing = await controller().create(request(), {
      type: "PERCENT",
      scope: "ALL",
      mode: "COUPON",
      code: "KEEP",
      value: 10,
      startsAt: START,
    } as never);

    const saved = await controller().update(request(), existing.id, { value: 25 } as never);

    const row = await db().discount.findUnique({ where: { id: saved.id } });
    expect(row?.value).toBe(25);
    expect(row?.type).toBe("PERCENT");
    expect(row?.code).toBe("keep");
  });

  it("judges the merged discount, not just the fields the form sent", async () => {
    // The rule that only exists on an update. Switching a coupon to automatic clears its code, and
    // the request that does it says nothing about `value` or the window — so a check against the
    // request alone would pass a discount whose stored state is illegal.
    const existing = await makeDiscount({ productIds: [], scope: "ALL", value: 10, mode: "COUPON" });

    await expect(
      controller().update(request(), existing.id, { value: 500 } as never),
    ).rejects.toThrow(/بین ۱ تا ۱۰۰/);
  });

  it("clears the code when a coupon becomes automatic", async () => {
    // Otherwise a stale code sits in the column where `applyDiscounts` filters coupons by mode and
    // silently ignores it — and it keeps blocking a different discount that wants that code.
    const existing = await makeDiscount({ productIds: [], scope: "ALL", value: 10, mode: "COUPON" });

    await controller().update(request(), existing.id, { mode: "AUTOMATIC" } as never);

    const row = await db().discount.findUnique({ where: { id: existing.id } });
    expect(row?.code).toBeNull();
  });

  it("does not treat a coupon's own code as a collision with itself", async () => {
    // A real case rather than a hypothetical one: the panel's form always sends the whole discount,
    // so every save of an unchanged coupon arrives carrying the code it already has. Created through
    // the write path, so the stored code is the canonical one and the comparison is like for like —
    // a fixture's `DISC-7` would be rewritten to `disc-7` by the canonicalisation, which is correct
    // and is not what this test is about.
    const existing = await controller().create(request(), {
      type: "PERCENT",
      scope: "ALL",
      mode: "COUPON",
      code: "KEEP",
      value: 10,
      startsAt: START,
    } as never);

    const saved = await controller().update(request(), existing.id, { value: 15 } as never);

    expect(saved.code).toBe("keep");
  });

  it("refuses a code another coupon holds", async () => {
    // The coupon that holds the code is created through the gateway's own write path rather than
    // written straight to the table by a fixture. That matters: a fixture may put any spelling in the
    // column, and a check that recognised only the canonical one would miss exactly the rows a coupon
    // written by hand would produce — a test passing for the wrong reason.
    const taken = await controller().create(request(), {
      type: "PERCENT",
      scope: "ALL",
      mode: "COUPON",
      code: "SUMMER",
      value: 10,
      startsAt: START,
    } as never);

    const mine = await db().discount.create({
      data: {
        code: "MINE",
        scope: "ALL",
        type: "PERCENT",
        value: 5,
        mode: "COUPON",
        productIds: [],
        categoryIds: [],
        collectionIds: [],
        startsAt: new Date(START),
      },
    });

    await expect(
      controller().update(request(), mine.id, { code: taken.code ?? undefined } as never),
    ).rejects.toThrow(/قبلاً استفاده شده/);
  });

  it("answers a discount that is not there as absent", async () => {
    // The panel's `discount.update` against a stale id was a Prisma error it reported as "ذخیره
    // انجام نشد" — indistinguishable from a database being down.
    await expect(
      controller().update(request(), "no-such-discount", { value: 5 } as never),
    ).rejects.toThrow(/پیدا نشد/);

    expect(await db().adminAuditLog.count()).toBe(0);
  });

  it("does not change anything when the audit write fails", async () => {
    const existing = await makeDiscount({ productIds: [], scope: "ALL", value: 10 });

    await expect(
      controller(dbWithFailingAudit()).update(request(), existing.id, { value: 30 } as never),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    const row = await db().discount.findUnique({ where: { id: existing.id } });
    expect(row?.value).toBe(10);
  });

  it("does not edit a discount for an unauthenticated request", async () => {
    const existing = await makeDiscount({ productIds: [], scope: "ALL", value: 10 });

    await expect(
      controller().update(
        { headers: { cookie: "kmodern_admin=bad" } } as never,
        existing.id,
        { value: 30 } as never,
      ),
    ).rejects.toThrow();

    const row = await db().discount.findUnique({ where: { id: existing.id } });
    expect(row?.value).toBe(10);
  });
});

describe("an operator deletes a discount", () => {
  beforeEach(resetDatabase);
  let operatorId: string;

  beforeEach(async () => {
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

  function controller(client: Db = db() as Db) {
    const auth = {
      adminForToken: async (token: string) =>
        token === "good" ? { admin: { id: operatorId, email: "operator@kmodern.ir" } } : null,
    } as never;
    return new DiscountsController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  it("deletes the row and records it", async () => {
    const existing = await makeDiscount({ productIds: [], scope: "ALL", value: 10 });

    await controller().remove(request(), existing.id);

    expect(await db().discount.count()).toBe(0);
    const lines = await db().adminAuditLog.findMany({ where: { entityId: existing.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ action: "DISCOUNT_DELETED" });
  });

  it("leaves an order that used the discount alone", async () => {
    // Unlike a category, nothing here is a foreign key: an order records the discount as an id inside
    // `appliedDiscounts`, so deleting the row cannot orphan a row that points at it. The assertion is
    // here because "nothing cascades" is the kind of fact that is true today and quietly stops being
    // true if someone adds a relation.
    const existing = await makeDiscount({ productIds: [], scope: "ALL", value: 10 });
    const order = await makeOrder({ total: 900 });
    await db().order.update({
      where: { id: order.id },
      data: { appliedDiscounts: [{ discountId: existing.id, amountOff: 100 }] },
    });

    await controller().remove(request(), existing.id);

    const reloaded = await db().order.findUnique({ where: { id: order.id } });
    expect(reloaded?.appliedDiscounts).toEqual([{ discountId: existing.id, amountOff: 100 }]);
  });

  it("does not delete anything when the audit write fails", async () => {
    const existing = await makeDiscount({ productIds: [], scope: "ALL", value: 10 });

    await expect(
      controller(dbWithFailingAudit()).remove(request(), existing.id),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    expect(await db().discount.count()).toBe(1);
  });

  it("answers a discount that is not there as absent", async () => {
    await expect(controller().remove(request(), "no-such-discount")).rejects.toThrow(/پیدا نشد/);

    expect(await db().adminAuditLog.count()).toBe(0);
  });

  it("does not delete a discount for an unauthenticated request", async () => {
    const existing = await makeDiscount({ productIds: [], scope: "ALL", value: 10 });

    await expect(
      controller().remove({ headers: { cookie: "kmodern_admin=bad" } } as never, existing.id),
    ).rejects.toThrow();

    expect(await db().discount.count()).toBe(1);
  });
});

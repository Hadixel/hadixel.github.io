// The panel's product write, as the gateway applies it.
//
// The last and largest of the panel's writes, and the one with a defect that only became visible once
// the write moved. The panel's variant diff contained a compare-and-set that could not fire:
//
//     const existing = await tx.variant.findFirst({ where: { id: v.id, productId: p.id } });
//     const updated = await tx.variant.updateMany({
//       where: { id: v.id, productId: p.id, stock: existing.stock, reserved: existing.reserved },
//
// `existing` was read on the same connection, inside the same transaction, two statements earlier — so
// the condition is true by construction. The comment above it claimed "a stale product form cannot
// overwrite a concurrent order", and the code could not do that: a form showing a stale stock wrote
// straight over a hold taken since. The reserved floor underneath it was real, and it is now
// `setVariantStock`, which the manual stock adjustment calls too.

import { beforeEach, describe, expect, it } from "vitest";
import type { createPrismaClient } from "../src/prisma/client.js";
import { ProductsController } from "../src/products/products.controller.js";
import { db } from "../src/prisma/index.js";
import { makeCategory, makeOrder, makeProduct, makeVariantOn, resetDatabase } from "./harness.js";

type Db = ReturnType<typeof createPrismaClient>;

/** The real database, with the audit write rigged to fail. */
function dbWithFailingAudit(): Db {
  const real = db() as Db;
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === "$transaction") {
        return async (fn: (tx: unknown) => unknown) =>
          (target.$transaction as (f: (tx: unknown) => unknown) => unknown)((tx: unknown) =>
            fn(
              new Proxy(tx as object, {
                get(txTarget, txProp) {
                  if (txProp === "adminAuditLog") {
                    return { create: () => Promise.reject(new Error("AUDIT_WRITE_FAILED")) };
                  }
                  return Reflect.get(txTarget, txProp, txTarget);
                },
              }),
            ),
          );
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as Db;
}

/** One variant, as the form's editor sends it. */
function variant(over: Record<string, unknown> = {}) {
  return {
    colorName: "مشکی",
    sku: "SKU-1",
    price: 1_000_000,
    stock: 5,
    allowBackorder: false,
    images: [] as string[],
    ...over,
  };
}

describe("an operator creates a product", () => {
  beforeEach(resetDatabase);
  let operatorId: string;
  let categoryId: string;

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
    categoryId = (await makeCategory("mobile", "موبایل")).id;
  });

  function controller(client: Db = db() as Db) {
    const auth = {
      adminForToken: async (token: string) =>
        token === "good" ? { admin: { id: operatorId, email: "operator@kmodern.ir" } } : null,
    } as never;
    return new ProductsController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  const body = (over: Record<string, unknown> = {}) => ({
    name: "گوشی موبایل",
    brand: "برند",
    model: "203",
    categoryId,
    status: "PUBLISHED",
    variants: [variant()],
    specValues: {},
    extraSpecs: {},
    ...over,
  });

  it("stores the product, its variants and the audit line together", async () => {
    const saved = await controller().create(request(), body() as never);

    const product = await db().product.findUnique({ where: { id: saved.id } });
    expect(product).toMatchObject({ name: "گوشی موبایل", brand: "برند", model: "203" });

    const variants = await db().variant.findMany({ where: { productId: saved.id } });
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({ sku: "SKU-1", price: 1_000_000, stock: 5 });

    const lines = await db().adminAuditLog.findMany({ where: { entityId: saved.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ action: "PRODUCT_CREATED", entityType: "PRODUCT" });
  });

  // The panel had no slug function at all, so a product's address was whatever the operator typed and
  // `"موبایل"` and `"mobile"` were two products at two addresses.
  it("produces the slug rather than taking whatever the form sent", async () => {
    const saved = await controller().create(request(), body() as never);

    // Spelled out letter by letter, because guessing a Persian transliteration from the English
    // meaning is how this assertion ends up asserting something false. "گوشی" is گ→g, و→v, ش→sh,
    // ی→y; "موبایل" is م→m, و→v, ب→b, ا→a, ی→y, ل→l. A `w` appears nowhere in either word.
    const product = await db().product.findUnique({ where: { id: saved.id } });
    expect(product?.slug).toBe("brnd-203-gvshy-mvbayl");
  });

  it("canonicalises a slug the operator did supply", async () => {
    const saved = await controller().create(request(), body({ slug: "  Summer Sale  " }) as never);

    const product = await db().product.findUnique({ where: { id: saved.id } });
    expect(product?.slug).toBe("summer-sale");
  });

  it("refuses a slug another product holds", async () => {
    await controller().create(request(), body({ slug: "taken" }) as never);

    await expect(
      controller().create(request(), body({ slug: "  TAKEN " }) as never),
    ).rejects.toThrow(/اسلاگ/);
  });

  it("refuses a product with no variant, which is unsellable", async () => {
    // The panel accepted one, leaving a row that looked live in its own list and could not be bought.
    await expect(
      controller().create(request(), body({ variants: [] }) as never),
    ).rejects.toThrow(/تنوع/);

    expect(await db().product.count()).toBe(0);
  });

  it("refuses a category that is not there, naming it rather than a foreign key", async () => {
    await expect(
      controller().create(request(), body({ categoryId: "no-such-category" }) as never),
    ).rejects.toThrow(/دسته‌بندی/);

    expect(await db().product.count()).toBe(0);
  });

  it("refuses a SKU another variant already holds", async () => {
    await controller().create(request(), body() as never);

    await expect(
      controller().create(
        request(),
        body({ name: "دیگر", model: "204", variants: [variant({ sku: "SKU-1" })] }) as never,
      ),
    ).rejects.toThrow(/SKU/);

    expect(await db().product.count()).toBe(1);
  });

  it("writes only the spec values the category declares", async () => {
    const other = await makeCategory("kitchen", "آشپزخانه");
    const mine = await db().categorySpecField.create({
      data: { categoryId, name: "رنگ", type: "string" },
    });
    const theirs = await db().categorySpecField.create({
      data: { categoryId: other.id, name: "متر", type: "string" },
    });

    await controller().create(
      request(),
      body({ specValues: { [mine.id]: "  مشکی  " } }) as never,
    );

    const values = await db().productSpecValue.findMany({ where: { productId: { not: "" } } });
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({ specFieldId: mine.id, value: "مشکی" });

    // A value for another category's field is refused rather than silently dropped, which is what the
    // panel did: it looped the category's own fields, so the operator saw the value in the form and
    // it never appeared anywhere.
    await expect(
      controller().create(
        request(),
        body({ name: "دیگر", model: "204", variants: [variant({ sku: "OTHER-1" })], specValues: { [theirs.id]: "۱" } }) as never,
      ),
    ).rejects.toThrow(/مشخصات/);
  });

  it("refuses an SEO block the shared contract rejects, rather than dropping it", async () => {
    await expect(
      controller().create(request(), body({ seo: { title: 1 } }) as never),
    ).rejects.toThrow(/SEO/);

    expect(await db().product.count()).toBe(0);
  });

  it("does not save anything when the audit write fails", async () => {
    await expect(
      controller(dbWithFailingAudit()).create(request(), body() as never),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    expect(await db().product.count()).toBe(0);
    expect(await db().variant.count()).toBe(0);
    expect(await db().adminAuditLog.count()).toBe(0);
  });

  it("does not create a product for an unauthenticated request", async () => {
    await expect(
      controller().create({ headers: { cookie: "kmodern_admin=bad" } } as never, body() as never),
    ).rejects.toThrow();

    expect(await db().product.count()).toBe(0);
  });
});

describe("an operator edits a product", () => {
  beforeEach(resetDatabase);
  let operatorId: string;
  let categoryId: string;

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
    categoryId = (await makeCategory("mobile", "موبایل")).id;
  });

  function controller(client: Db = db() as Db) {
    const auth = {
      adminForToken: async (token: string) =>
        token === "good" ? { admin: { id: operatorId, email: "operator@kmodern.ir" } } : null,
    } as never;
    return new ProductsController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  it("keeps the address when the form did not touch the slug", async () => {
    const existing = await makeProduct({ categoryId });
    const before = await db().product.findUniqueOrThrow({ where: { id: existing.id } });
    const own = await db().variant.findFirstOrThrow({ where: { productId: existing.id } });

    const saved = await controller().update(
      request(),
      existing.id,
      {
        name: "نام تازه",
        brand: "برند",
        model: "203",
        categoryId,
        status: "PUBLISHED",
        // The form always sends every variant, so an update that sent none would be a form bug — and
        // the gateway refuses a product with no variant rather than quietly emptying it.
        variants: [
          { id: own.id, colorName: own.colorName, sku: own.sku, price: own.price, stock: own.stock, allowBackorder: false, images: [] },
        ],
        specValues: {},
        extraSpecs: {},
      } as never,
    );

    expect(saved.slug).toBe(before.slug);
  });

  it("adds a variant, keeps the others, and drops what the form left out", async () => {
    const existing = await makeProduct({ categoryId });
    const keep = await makeVariantOn(existing.id, { sku: "KEEP", colorName: "قرمز" });
    const drop = await makeVariantOn(existing.id, { sku: "DROP", colorName: "آبی" });

    await controller().update(request(), existing.id, {
      name: "گوشی موبایل",
      brand: "برند",
      model: "203",
      categoryId,
      status: "PUBLISHED",
      variants: [
        { id: keep.id, colorName: "قرمز", sku: "KEEP", price: 100, stock: 1, allowBackorder: false, images: [] },
        variant({ sku: "NEW", colorName: "سبز" }),
      ],
      specValues: {},
      extraSpecs: {},
    } as never);

    const skus = (await db().variant.findMany({ where: { productId: existing.id } })).map(
      (row) => row.sku,
    );
    expect(skus.sort()).toEqual(["KEEP", "NEW"]);
    expect(skus).not.toContain(drop.sku);
  });

  it("refuses a variant that belongs to another product", async () => {
    const mine = await makeProduct({ categoryId });
    const theirs = await makeProduct({ categoryId });
    const foreign = await makeVariantOn(theirs.id, { sku: "THEIRS" });

    await expect(
      controller().update(request(), mine.id, {
        name: "گوشی موبایل",
        brand: "برند",
        model: "203",
        categoryId,
        status: "PUBLISHED",
        variants: [
          { id: foreign.id, colorName: "قرمز", sku: "THEIRS", price: 100, stock: 1, allowBackorder: false, images: [] },
        ],
        specValues: {},
        extraSpecs: {},
      } as never),
    ).rejects.toThrow(/متعلق/);

    // Nothing moved: the variant still belongs to the product it did.
    const untouched = await db().variant.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(untouched.productId).toBe(theirs.id);
  });

  it("refuses a stock below what is already reserved, naming the SKUs a delete would not", async () => {
    // The floor, through the same primitive a manual adjustment uses — which is the reason the panel's
    // copy could not be trusted: it had its own, and the two could disagree about what is promised.
    const existing = await makeProduct({ categoryId });
    const reserved = await makeVariantOn(existing.id, { sku: "HELD", stock: 10, reserved: 4 });
    const order = await makeOrder();
    await db().stockReservation.create({
      data: {
        orderId: order.id,
        variantId: reserved.id,
        qty: 4,
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    await expect(
      controller().update(request(), existing.id, {
        name: "گوشی موبایل",
        brand: "برند",
        model: "203",
        categoryId,
        status: "PUBLISHED",
        variants: [
          { id: reserved.id, colorName: "مشکی", sku: "HELD", price: 100, stock: 1, allowBackorder: false, images: [] },
        ],
        specValues: {},
        extraSpecs: {},
      } as never),
    ).rejects.toThrow(/رزروشده/);

    const untouched = await db().variant.findUniqueOrThrow({ where: { id: reserved.id } });
    expect(untouched.stock).toBe(10);
  });

  it("does not change anything when the audit write fails", async () => {
    const existing = await makeProduct({ categoryId });

    await expect(
      controller(dbWithFailingAudit()).update(request(), existing.id, {
        name: "نام تازه",
        brand: "برند",
        model: "203",
        categoryId,
        status: "PUBLISHED",
        variants: [variant()],
        specValues: {},
        extraSpecs: {},
      } as never),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    const row = await db().product.findUniqueOrThrow({ where: { id: existing.id } });
    expect(row.name).toBe(existing.name);
  });

  it("answers a product that is not there as absent", async () => {
    await expect(
      controller().update(request(), "no-such-product", {
        name: "x",
        brand: "y",
        model: "z",
        categoryId,
        status: "DRAFT",
        variants: [variant()],
        specValues: {},
        extraSpecs: {},
      } as never),
    ).rejects.toThrow(/پیدا نشد/);

    expect(await db().adminAuditLog.count()).toBe(0);
  });
});

describe("an operator deletes a product", () => {
  beforeEach(resetDatabase);
  let operatorId: string;
  let categoryId: string;

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
    categoryId = (await makeCategory("mobile", "موبایل")).id;
  });

  function controller(client: Db = db() as Db) {
    const auth = {
      adminForToken: async (token: string) =>
        token === "good" ? { admin: { id: operatorId, email: "operator@kmodern.ir" } } : null,
    } as never;
    return new ProductsController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  it("deletes a product with nothing on it, spec values and all", async () => {
    // The same class of gap the category delete had: nothing cascades, and the panel's delete had no
    // catch, so a product with specification values could not be deleted from the panel at all.
    // `stock: 0` because a product holding stock is refused, and the fixture seeds five units.
    const existing = await makeProduct({ categoryId, stock: 0 });
    const field = await db().categorySpecField.create({
      data: { categoryId, name: "رنگ", type: "string" },
    });
    await db().productSpecValue.create({
      data: { productId: existing.id, specFieldId: field.id, value: "مشکی" },
    });

    await controller().remove(request(), existing.id);

    expect(await db().product.count()).toBe(0);
    expect(await db().productSpecValue.count()).toBe(0);

    const lines = await db().adminAuditLog.findMany({ where: { entityId: existing.id } });
    expect(lines[0]).toMatchObject({ action: "PRODUCT_DELETED" });
  });

  it("refuses a product that still has stock, and names the SKUs", async () => {
    const existing = await makeProduct({ categoryId });
    await makeVariantOn(existing.id, { sku: "IN-STOCK", stock: 3 });

    await expect(controller().remove(request(), existing.id)).rejects.toThrow(/IN-STOCK/);

    expect(await db().product.count()).toBe(1);
  });

  it("does not delete anything when the audit write fails", async () => {
    const existing = await makeProduct({ categoryId, stock: 0 });

    await expect(
      controller(dbWithFailingAudit()).remove(request(), existing.id),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    expect(await db().product.count()).toBe(1);
  });

  it("answers a product that is not there as absent", async () => {
    await expect(controller().remove(request(), "no-such-product")).rejects.toThrow(/پیدا نشد/);
  });
});

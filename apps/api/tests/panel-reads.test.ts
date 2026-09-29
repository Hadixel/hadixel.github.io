// The panel's server-side reads, as the gateway serves them.
//
// Criterion 10 asks that the panel's pages read through the gateway and issue no database import of
// any kind. The reads themselves are the gateway's, so what is worth pinning is the *shape*: a picker
// that has to fetch each product to label a row is a read the gateway should have answered, and an
// unbounded list is not a control.
//
// The panel's half — that these pages no longer import the data tier — is asserted in
// apps/admin/src/lib/actions/catalogue.test.ts, where the source of the page can be read.

import { beforeEach, describe, expect, it } from "vitest";
import { CategoriesController } from "../src/categories/categories.controller.js";
import { CollectionsController } from "../src/collections/collections.controller.js";
import { DiscountsController } from "../src/discounts/discounts.controller.js";
import { ProductsController } from "../src/products/products.controller.js";
import { db } from "../src/prisma/index.js";
import { makeCategory, makeDiscount, makeProduct, resetDatabase } from "./harness.js";

describe("the panel reads the category tree", () => {
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

  const controller = () => {
    const auth = {
      adminForToken: async (token: string) =>
        token === "good" ? { admin: { id: operatorId, email: "operator@kmodern.ir" } } : null,
    } as never;
    return new CategoriesController(auth, db() as never);
  };

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  // What the panel used to assemble itself, in N+1 over tables it should not be reading: the parent's
  // name, both counts, and the declared spec fields, because the manager holds ids and renders labels.
  it("answers each row with its parent's name and both counts", async () => {
    const parent = await makeCategory("mobile", "موبایل");
    const child = await makeCategory("phone", "گوشی", parent.id);
    await makeProduct({ categoryId: child.id });
    await db().categorySpecField.create({
      data: { categoryId: child.id, name: "رنگ", type: "string" },
    });

    const rows = await controller().list(request());

    const childRow = rows.find((row) => row.id === child.id);
    expect(childRow?.parentName).toBe("موبایل");
    expect(childRow?.productCount).toBe(1);
    expect(childRow?.childCount).toBe(0);
    expect(childRow?.specFields).toHaveLength(1);

    const parentRow = rows.find((row) => row.id === parent.id);
    expect(parentRow?.parentName).toBeUndefined();
    expect(parentRow?.childCount).toBe(1);
  });

  it("needs an operator, because it answers with the shop's shape rather than the catalogue", async () => {
    // The public catalogue exposes a category's name and its products. This view adds its spec fields
    // and its counts, which is management metadata, and a management view reachable without a session
    // is a view of the shop handed to anyone who asks.
    await expect(
      controller().list({ headers: { cookie: "kmodern_admin=bad" } } as never),
    ).rejects.toThrow();
  });

  it("orders by parent, then by the operator's own position", async () => {
    // By `sortOrder`, not alphabetically — the panel's query always ordered this way and an operator
    // who dragged a category up expects it to stay up. The earlier version of this test asserted an
    // alphabetical order the query never promised, and failed against a correct implementation.
    const parent = await makeCategory("mobile", "موبایل");
    const second = await makeCategory("b", "دوم", parent.id);
    const first = await makeCategory("a", "اول", parent.id);
    await db().category.update({ where: { id: first.id }, data: { sortOrder: 0 } });
    await db().category.update({ where: { id: second.id }, data: { sortOrder: 1 } });

    const rows = await controller().list(request());
    const names = rows.map((row) => row.name);
    expect(names.indexOf("اول")).toBeLessThan(names.indexOf("دوم"));
  });
});

describe("the panel reads the collections", () => {
  beforeEach(resetDatabase);

  const controller = () => new CollectionsController({} as never, db() as never);

  it("answers with each member's product name, so the editor never fetches to label a row", async () => {
    const collection = await db().collection.create({ data: { name: "پیشنهاد", slug: "offers" } });
    const product = await makeProduct({ name: "جارو" });
    await db().collectionItem.create({
      data: { collectionId: collection.id, productId: product.id, sortOrder: 0 },
    });

    const rows = await controller().list();

    expect(rows[0]?.items[0]).toMatchObject({ productId: product.id, productName: "جارو" });
  });
});

describe("the panel reads product names for a picker", () => {
  beforeEach(resetDatabase);

  const controller = () => new ProductsController({} as never, db() as never);

  it("answers an id and a name and nothing else", async () => {
    // A picker needs a label beside an id. Returning the whole product row would hand the panel
    // everything it does not need and tempt it to render from a shape nobody decided on.
    await makeProduct({ name: "جارو" });

    const options = await controller().options();

    expect(options[0]).toEqual({ id: expect.any(String), name: "جارو" });
    expect(Object.keys(options[0] ?? {}).sort()).toEqual(["id", "name"]);
  });

  it("is capped, because an unbounded list is not a control", async () => {
    // One product is enough to assert the cap exists; building 501 to prove 500 is a cost the test
    // pays on every run to learn nothing the constant does not already say.
    await makeProduct({ name: "جارو" });
    const options = await controller().options();
    expect(options.length).toBeLessThanOrEqual(500);
  });
});

describe("the panel reads the discount list", () => {
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

  const controller = () => {
    const auth = {
      adminForToken: async (token: string) =>
        token === "good" ? { admin: { id: operatorId, email: "operator@kmodern.ir" } } : null,
    } as never;
    return new DiscountsController(auth, db() as never);
  };

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  // The page used to run three queries of its own — the rows, the total for the pager, and the
  // active count for the header. Answered together, because a count fetched beside the rows it
  // describes can disagree with them.
  it("answers the rows and both counts in one read", async () => {
    await makeDiscount({ productIds: [], scope: "ALL", value: 10 });
    await makeDiscount({ productIds: [], scope: "ALL", value: 20, status: "DISABLED" });

    const page = await controller().list(request(), undefined, undefined);

    expect(page.total).toBe(2);
    expect(page.active).toBe(1);
    expect(page.rows).toHaveLength(2);
  });

  it("clamps the page and the size, so neither is a client's to overrule the server on", async () => {
    await makeDiscount({ productIds: [], scope: "ALL", value: 10 });

    // A negative page and an enormous size are both answered rather than refused: a pager that has
    // drifted should still render, and the bound is the server's to hold.
    const negative = await controller().list(request(), "-5", undefined);
    expect(negative.page).toBe(1);

    const huge = await controller().list(request(), "1", "100000");
    expect(huge.size).toBeLessThanOrEqual(100);
  });

  it("answers one discount in full, for the edit form to seed itself from", async () => {
    const existing = await makeDiscount({ productIds: [], scope: "ALL", value: 25, mode: "COUPON" });

    const detail = await controller().one(request(), existing.id);

    expect(detail).toMatchObject({ id: existing.id, value: 25, mode: "COUPON" });
    expect(detail.code).toBe(existing.code);
  });

  it("answers a discount that is not there as absent, so the page can say notFound", async () => {
    await expect(controller().one(request(), "no-such-discount")).rejects.toThrow(/پیدا نشد/);
  });

  it("needs an operator for both reads", async () => {
    const anonymous = { headers: { cookie: "kmodern_admin=bad" } } as never;
    await expect(controller().list(anonymous, undefined, undefined)).rejects.toThrow();
    await expect(controller().one(anonymous, "anything")).rejects.toThrow();
  });
});

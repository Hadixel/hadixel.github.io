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
import { InventoryController } from "../src/inventory/inventory.controller.js";
import { CategoriesController } from "../src/categories/categories.controller.js";
import { CollectionsController } from "../src/collections/collections.controller.js";
import { OrdersService } from "../src/orders/orders.service.js";
import { db } from "../src/prisma/index.js";
import { makeCategory, makeOrder, makeProduct, makeVariant, readVariant, resetDatabase } from "./harness.js";

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

// ---- Categories and collections ----
//
// Two features chosen first because they are the cheapest pair left, and because the shape they
// establish is the shape the rest of the panel's writes take. Both used to be the panel's own: their
// rules, their transactions, their audit lines written *after* the change had already committed, and
// their errors decided by matching the text of a Prisma error (`msg.includes("slug") &&
// msg.includes("Unique")`), which is a rule about a driver's wording rather than about the shop.

describe("an operator creates a category", () => {
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
    return new CategoriesController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  it("stores the category and names the operator in the audit trail", async () => {
    const saved = await controller().create(request(), { name: "موبایل", weightKg: 2.5 });

    // م و ب ا ی ل  ->  m v b a y l, letter by letter through the table in slugify.ts. Spelled out
    // rather than produced by running the slugifier, because an expected value that comes from the
    // function under test asserts nothing. Note it is *not* "mobile": the transliteration is
    // mechanical, so و is `v`, not the `o` an English reader would supply.
    expect(saved.slug).toBe("mvbayl");
    const stored = await db().category.findUniqueOrThrow({ where: { id: saved.id } });
    expect(stored.name).toBe("موبایل");
    expect(stored.weightKg).toBe(2.5);

    const lines = await db().adminAuditLog.findMany({ where: { entityId: saved.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ action: "CATEGORY_CREATED", entityType: "CATEGORY" });
    expect(lines[0].adminUserId).toBe(operatorId);
  });

  // The half that used to be false. The panel committed the category, then wrote the audit line as a
  // separate statement, so a failed audit write was a category nobody could account for — and the
  // operator was told it saved. This is the same guarantee the status-change tests above pin, on a
  // different feature, because a guarantee that only one feature honours is a convention.
  it("does not create the category when the audit write fails", async () => {
    await expect(
      controller(dbWithFailingAudit()).create(request(), { name: "موبایل", weightKg: 2.5 }),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    expect(await db().category.count()).toBe(0);
    expect(await db().adminAuditLog.count()).toBe(0);
  });

  it("does not create a category for an unauthenticated request", async () => {
    await expect(
      controller().create({ headers: { cookie: "kmodern_admin=bad" } } as never, {
        name: "موبایل",
        weightKg: 2.5,
      }),
    ).rejects.toThrow();

    expect(await db().category.count()).toBe(0);
  });

  // Criterion 8. The panel stored the form's slug verbatim, so `"  Summer  Sale  "`, `"summer sale"`
  // and `"Summer Sale"` were three categories the database considered distinct, and a category
  // created with a Persian slug was unreachable at the address its own name would have given it.
  it("canonicalises a slug the operator typed rather than storing it verbatim", async () => {
    const saved = await controller().create(request(), {
      name: "تخفیف تابستان",
      slug: "  Summer  Sale  ",
      weightKg: 1,
    });

    expect(saved.slug).toBe("summer-sale");
    const stored = await db().category.findUniqueOrThrow({ where: { id: saved.id } });
    expect(stored.slug).toBe("summer-sale");
  });

  it("derives the slug from the name when the form did not supply one", async () => {
    const saved = await controller().create(request(), { name: "لوازم خانگی", weightKg: 1 });
    // ل و ا ز م  ->  l v a z m  =  lvazm   (five letters; the transliteration is mechanical, so it
    // is not the six-letter "lavazm" an English reader supplies)
    // خ ا ن گ ی  ->  kh a n g y  =  khangy
    expect(saved.slug).toBe("lvazm-khangy");
  });

  // The payoff of canonicalising rather than trimming. Because both spellings reach the same column,
  // the collision is *detectable* — the panel could only have caught it by matching the text of a
  // Prisma error, which is a rule about a driver's wording and stops being true when the wording
  // changes.
  it("answers a slug already in use as a conflict naming the slug", async () => {
    await controller().create(request(), { name: "موبایل", weightKg: 1 });

    await expect(
      controller().create(request(), { name: "موبایل", slug: "mvbayl", weightKg: 1 }),
    ).rejects.toThrow(/mvbayl/);

    // One row, not two. A refused save that left a row behind would be worse than no check at all.
    expect(await db().category.count()).toBe(1);
  });
});

describe("the category tree is two levels deep", () => {
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
    return new CategoriesController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  const root = () => makeCategory("root", "ریشه");
  const child = (parentId: string) => makeCategory("child", "فرزند", parentId);

  it("nests a category under a root", async () => {
    const parent = await root();
    const saved = await controller().create(request(), {
      name: "گوشی",
      weightKg: 1,
      parentId: parent.id,
    });

    const stored = await db().category.findUniqueOrThrow({ where: { id: saved.id } });
    expect(stored.parentId).toBe(parent.id);
  });

  // The rule the panel enforced and the storefront's category page assumes: a third level has
  // nowhere to render. The panel's copy read the parent, checked it, and wrote in three separate
  // round trips, so a second operator re-parenting in between produced a three-level tree that
  // nothing had refused.
  it("refuses a parent that is itself a child", async () => {
    const parent = await root();
    const middle = await child(parent.id);

    await expect(
      controller().create(request(), { name: "نو", weightKg: 1, parentId: middle.id }),
    ).rejects.toThrow(/دو سطح/);

    expect(await db().category.count()).toBe(2);
  });

  // Self-parenting is not expressible on a create — a new category has no id to name — so it is
  // pinned in the update slice below, where it is a real request.

  it("refuses a parent that does not exist", async () => {
    await expect(
      controller().create(request(), { name: "یتیم", weightKg: 1, parentId: "no-such-category" }),
    ).rejects.toThrow(/والد/);

    expect(await db().category.count()).toBe(0);
  });

  it("moves a category under a different root, because that is a legal tree", async () => {
    const first = await makeCategory("first", "اول");
    const second = await makeCategory("second", "دوم");
    const child = await makeCategory("child", "فرزند", first.id);

    await controller().update(request(), child.id, {
      name: "فرزند",
      weightKg: 1,
      parentId: second.id,
    });

    const stored = await db().category.findUniqueOrThrow({ where: { id: child.id } });
    expect(stored.parentId).toBe(second.id);
  });

  // Only expressible on an update, which is why it is pinned here and not on the create above: a new
  // category has no id, so it cannot name itself. The panel carried this check, and it was the one
  // part of the parent rule that could not fire on a create either.
  it("refuses to make a category its own parent", async () => {
    const parent = await root();

    await expect(
      controller().update(request(), parent.id, { name: "ریشه", weightKg: 1, parentId: parent.id }),
    ).rejects.toThrow(/خودش/);

    const stored = await db().category.findUniqueOrThrow({ where: { id: parent.id } });
    expect(stored.parentId).toBeNull();
  });
});

describe("an operator edits a category", () => {
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
    return new CategoriesController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  it("changes the category in place, and says so in the trail", async () => {
    const category = await makeCategory("mvbayl", "موبایل");

    const saved = await controller().update(request(), category.id, {
      name: "موبایل و تبلت",
      slug: "موبایل و تبلت",
      weightKg: 3,
    });

    // One row, not a second one. An update that created a row would be indistinguishable from a
    // create at the level an operator sees, and the old panel's "save" was a create-or-update decided
    // by whether the form carried an id.
    expect(await db().category.count()).toBe(1);
    const stored = await db().category.findUniqueOrThrow({ where: { id: category.id } });
    expect(stored.id).toBe(saved.id);
    expect(stored.name).toBe("موبایل و تبلت");
    expect(stored.weightKg).toBe(3);
    // م و ب ا ی ل   و   ت ب ل ت  ->  the slug follows the name it was given, canonicalised
    expect(saved.slug).toBe("mvbayl-v-tblt");

    const lines = await db().adminAuditLog.findMany({ where: { entityId: category.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ action: "CATEGORY_UPDATED", entityType: "CATEGORY" });
  });

  it("answers a category that does not exist as absent, rather than creating one", async () => {
    await expect(
      controller().update(request(), "no-such-category", { name: "ناموجود", weightKg: 1 }),
    ).rejects.toThrow(/پیدا نشد/);

    expect(await db().category.count()).toBe(0);
  });

  it("leaves the category alone when the audit write fails", async () => {
    const category = await makeCategory("mvbayl", "موبایل");

    await expect(
      controller(dbWithFailingAudit()).update(request(), category.id, {
        name: "تغییر‌یافته",
        weightKg: 1,
      }),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    // The rename rolled back with the audit line, so a reader of the trail and a reader of the row
    // agree about what happened.
    const stored = await db().category.findUniqueOrThrow({ where: { id: category.id } });
    expect(stored.name).toBe("موبایل");
    expect(await db().adminAuditLog.count()).toBe(0);
  });

  it("keeps a slug the category already has when the form did not change it", async () => {
    const category = await makeCategory("mvbayl", "موبایل");

    const saved = await controller().update(request(), category.id, { name: "موبایل نو", weightKg: 1 });

    // The form omitted the slug, and renaming the category does not silently move its address. An
    // address that changes on a rename breaks every link already pointing at it.
    expect(saved.slug).toBe("mvbayl");
    expect(await db().category.count()).toBe(1);
  });

  it("refuses to take a slug another category already has", async () => {
    const first = await makeCategory("first", "اول");
    await makeCategory("second", "دوم");

    await expect(
      controller().update(request(), first.id, { name: "اول", slug: "second", weightKg: 1 }),
    ).rejects.toThrow(/second/);

    const stored = await db().category.findUniqueOrThrow({ where: { id: first.id } });
    expect(stored.slug).toBe("first");
  });
});

describe("a category's spec fields are edited as a set", () => {
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
    return new CategoriesController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  it("adds, keeps and drops them to match the form", async () => {
    const category = await makeCategory("mvbayl", "موبایل");
    const kept = await db().categorySpecField.create({
      data: { categoryId: category.id, name: "رنگ", type: "string", sortOrder: 0 },
    });
    const dropped = await db().categorySpecField.create({
      data: { categoryId: category.id, name: "وزن", type: "number", sortOrder: 1 },
    });

    await controller().update(request(), category.id, {
      name: "موبایل",
      weightKg: 1,
      specFields: [
        { id: kept.id, name: "رنگ", type: "string", sortOrder: 0 },
        { name: "حافظه", type: "string", sortOrder: 1 },
      ],
    });

    const fields = await db().categorySpecField.findMany({ where: { categoryId: category.id } });
    // Both sides sorted, because `Array.sort` compares UTF-16 code units and Persian does not sort
    // alphabetically that way — an unsorted expectation here would be asserting a code-unit order and
    // would read as though it were asserting something about Persian.
    expect(fields.map((f) => f.name).sort()).toEqual(["رنگ", "حافظه"].sort());
    // The kept field kept its id, which is what a product's stored value points at. Re-creating it
    // would orphan every product that had answered this specification.
    expect(fields.find((f) => f.name === "رنگ")?.id).toBe(kept.id);
    expect(await db().categorySpecField.findUnique({ where: { id: dropped.id } })).toBeNull();
  });

  // The panel's `SPEC_FIELD_OWNERSHIP`, which existed because the form posts spec-field ids as a JSON
  // array and nothing checked whose they were. A field belonging to another category would have been
  // re-pointed at this one, taking its values with it.
  it("refuses a spec field that belongs to another category", async () => {
    const mine = await makeCategory("mine", "من");
    const theirs = await makeCategory("theirs", "آن‌ها");
    const foreign = await db().categorySpecField.create({
      data: { categoryId: theirs.id, name: "رنگ", type: "string" },
    });

    await expect(
      controller().update(request(), mine.id, {
        name: "من",
        weightKg: 1,
        specFields: [{ id: foreign.id, name: "رنگ", type: "string" }],
      }),
    ).rejects.toThrow(/متعلق به این دسته/);

    const untouched = await db().categorySpecField.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(untouched.categoryId).toBe(theirs.id);
  });
});

describe("an operator deletes a category", () => {
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
    return new CategoriesController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  it("deletes an empty, childless category and records who deleted it", async () => {
    const category = await makeCategory("mvbayl", "موبایل");

    await controller().remove(request(), category.id);

    expect(await db().category.count()).toBe(0);
    const lines = await db().adminAuditLog.findMany({ where: { entityId: category.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ action: "CATEGORY_DELETED", entityType: "CATEGORY" });
    expect(lines[0].adminUserId).toBe(operatorId);
  });

  // Two faults an operator can act on differently, so two sentences: empty the category first, or
  // move its products. The panel returned one message for both.
  it("refuses to delete a category that still has products", async () => {
    const category = await makeCategory("mvbayl", "موبایل");
    await makeProduct({ categoryId: category.id });

    await expect(controller().remove(request(), category.id)).rejects.toThrow(/محصول/);

    expect(await db().category.count()).toBe(1);
    expect(await db().adminAuditLog.count()).toBe(0);
  });

  it("refuses to delete a category that still has children", async () => {
    const parent = await makeCategory("parent", "والد");
    await makeCategory("child", "فرزند", parent.id);

    await expect(controller().remove(request(), parent.id)).rejects.toThrow(/زیردسته/);

    expect(await db().category.count()).toBe(2);
  });

  it("answers a category that is not there as absent", async () => {
    await expect(controller().remove(request(), "no-such-category")).rejects.toThrow(/پیدا نشد/);

    expect(await db().adminAuditLog.count()).toBe(0);
  });

  // Found while moving the write, not before: nothing in the schema cascades, so deleting a category
  // that still has spec fields raises a foreign key error. The panel's `deleteCategory` had no catch
  // around it, so the operator got an unhandled rejection rather than a sentence — which means a
  // category with specification fields could not be deleted from the panel at all. The values that
  // pointed at those fields cannot exist here, because a value needs a product and a category with
  // products is refused above.
  it("takes the category's spec fields with it", async () => {
    const category = await makeCategory("mvbayl", "موبایل");
    await db().categorySpecField.create({
      data: { categoryId: category.id, name: "رنگ", type: "string" },
    });

    await controller().remove(request(), category.id);

    expect(await db().category.count()).toBe(0);
    expect(await db().categorySpecField.count()).toBe(0);
  });

  it("does not delete the category when the audit write fails", async () => {
    const category = await makeCategory("mvbayl", "موبایل");

    await expect(controller(dbWithFailingAudit()).remove(request(), category.id)).rejects.toThrow(
      "AUDIT_WRITE_FAILED",
    );

    // A deletion nobody can account for is the worst of the three outcomes: the row is gone and the
    // trail says nothing about who removed it.
    expect(await db().category.count()).toBe(1);
    expect(await db().adminAuditLog.count()).toBe(0);
  });

  it("does not delete a category for an unauthenticated request", async () => {
    const category = await makeCategory("mvbayl", "موبایل");

    await expect(
      controller().remove({ headers: { cookie: "kmodern_admin=bad" } } as never, category.id),
    ).rejects.toThrow();

    expect(await db().category.count()).toBe(1);
  });
});

// ---- Collections ----
//
// The second of the two cheapest features, and the one with the panel's only write that was not in a
// transaction at all: `deleteCollection` deleted the membership rows, then the collection, then wrote
// the audit line, as three separate statements with nothing to bind them. A failure between the first
// two left a collection whose products had silently been emptied, and a failure after them left a
// deletion nobody could account for.

describe("an operator curates a collection", () => {
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
    return new CollectionsController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  it("stores the collection with its products, in the order it was given", async () => {
    const first = await makeProduct({ name: "اول" });
    const second = await makeProduct({ name: "دوم" });

    const saved = await controller().create(request(), {
      name: "پیشنهاد هفته",
      slug: "  Weekly  Offers ",
      items: [
        { productId: second.id, sortOrder: 0 },
        { productId: first.id, sortOrder: 1 },
      ],
    });

    expect(saved.slug).toBe("weekly-offers");
    const items = await db().collectionItem.findMany({
      where: { collectionId: saved.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(items.map((i) => i.productId)).toEqual([second.id, first.id]);

    const lines = await db().adminAuditLog.findMany({ where: { entityId: saved.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ action: "COLLECTION_CREATED", entityType: "COLLECTION" });
    expect(lines[0].adminUserId).toBe(operatorId);
  });

  it("does not create the collection when the audit write fails", async () => {
    const product = await makeProduct();

    await expect(
      controller(dbWithFailingAudit()).create(request(), {
        name: "پیشنهاد",
        items: [{ productId: product.id, sortOrder: 0 }],
      }),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    expect(await db().collection.count()).toBe(0);
    expect(await db().collectionItem.count()).toBe(0);
  });

  it("does not create a collection for an unauthenticated request", async () => {
    await expect(
      controller().create({ headers: { cookie: "kmodern_admin=bad" } } as never, {
        name: "پیشنهاد",
      }),
    ).rejects.toThrow();

    expect(await db().collection.count()).toBe(0);
  });

  it("refuses a product that is not there, naming it, rather than half-creating the collection", async () => {
    const real = await makeProduct({ name: "واقعی" });

    await expect(
      controller().create(request(), {
        name: "پیشنهاد",
        items: [
          { productId: real.id, sortOrder: 0 },
          { productId: "no-such-product", sortOrder: 1 },
        ],
      }),
    ).rejects.toThrow(/no-such-product/);

    // Nothing at all. The panel counted the products first and returned before the transaction, which
    // is the right answer for a bad id and the wrong place to have learned it.
    expect(await db().collection.count()).toBe(0);
    expect(await db().collectionItem.count()).toBe(0);
  });

  it("answers a slug already in use as a conflict", async () => {
    await controller().create(request(), { name: "پیشنهاد", slug: "offers" });

    await expect(
      controller().create(request(), { name: "پیشنهاد دیگر", slug: "  OFFERS " }),
    ).rejects.toThrow(/offers/);

    expect(await db().collection.count()).toBe(1);
  });

  it("replaces the membership on an edit, dropping the products the form no longer lists", async () => {
    const collection = await db().collection.create({ data: { name: "پیشنهاد", slug: "offers" } });
    const staying = await makeProduct({ name: "می‌ماند" });
    const leaving = await makeProduct({ name: "می‌رود" });
    await db().collectionItem.create({
      data: { collectionId: collection.id, productId: staying.id, sortOrder: 0 },
    });
    await db().collectionItem.create({
      data: { collectionId: collection.id, productId: leaving.id, sortOrder: 1 },
    });

    await controller().update(request(), collection.id, {
      name: "پیشنهاد",
      items: [{ productId: staying.id, sortOrder: 0 }],
    });

    const items = await db().collectionItem.findMany({ where: { collectionId: collection.id } });
    expect(items.map((i) => i.productId)).toEqual([staying.id]);
  });

  it("empties the collection when the form sends an empty list", async () => {
    const collection = await db().collection.create({ data: { name: "پیشنهاد", slug: "offers" } });
    const product = await makeProduct();
    await db().collectionItem.create({
      data: { collectionId: collection.id, productId: product.id, sortOrder: 0 },
    });

    await controller().update(request(), collection.id, { name: "پیشنهاد", items: [] });

    // An empty list means "no products", which is different from omitting the field. The panel's
    // create form sent `"[]"` and an update that could not tell those apart would either refuse to
    // empty a collection or empty one by accident.
    expect(await db().collectionItem.count()).toBe(0);
    expect(await db().collection.count()).toBe(1);
  });

  it("leaves the membership alone when the form did not mention it", async () => {
    const collection = await db().collection.create({ data: { name: "پیشنهاد", slug: "offers" } });
    const product = await makeProduct();
    await db().collectionItem.create({
      data: { collectionId: collection.id, productId: product.id, sortOrder: 0 },
    });

    await controller().update(request(), collection.id, { name: "پیشنهاد تازه" });

    expect(await db().collectionItem.count()).toBe(1);
  });

  it("keeps a slug the collection already has when the form did not change it", async () => {
    const collection = await db().collection.create({ data: { name: "پیشنهاد", slug: "offers" } });

    const saved = await controller().update(request(), collection.id, { name: "پیشنهاد نو" });

    // A rename does not move the address, or every link already pointing at it breaks.
    expect(saved.slug).toBe("offers");
  });

  it("answers a collection that does not exist as absent", async () => {
    await expect(
      controller().update(request(), "no-such-collection", { name: "ناموجود" }),
    ).rejects.toThrow(/پیدا نشد/);

    expect(await db().collection.count()).toBe(0);
  });
});

describe("an operator deletes a collection", () => {
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
    return new CollectionsController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  // The panel's version of this was three statements with nothing binding them, so a failure between
  // the first two left a collection that still existed with its products silently removed from it.
  it("takes the membership and the collection together, or neither", async () => {
    const collection = await db().collection.create({ data: { name: "پیشنهاد", slug: "offers" } });
    const product = await makeProduct();
    await db().collectionItem.create({
      data: { collectionId: collection.id, productId: product.id, sortOrder: 0 },
    });

    await controller().remove(request(), collection.id);

    expect(await db().collection.count()).toBe(0);
    expect(await db().collectionItem.count()).toBe(0);
    const lines = await db().adminAuditLog.findMany({ where: { entityId: collection.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ action: "COLLECTION_DELETED" });
  });

  it("does not delete anything when the audit write fails", async () => {
    const collection = await db().collection.create({ data: { name: "پیشنهاد", slug: "offers" } });
    const product = await makeProduct();
    await db().collectionItem.create({
      data: { collectionId: collection.id, productId: product.id, sortOrder: 0 },
    });

    await expect(
      controller(dbWithFailingAudit()).remove(request(), collection.id),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    expect(await db().collection.count()).toBe(1);
    expect(await db().collectionItem.count()).toBe(1);
  });

  // The panel's `deleteCollection` had no existence check, so a stale form produced an unhandled
  // Prisma error rather than a sentence.
  it("answers a collection that is not there as absent", async () => {
    await expect(controller().remove(request(), "no-such-collection")).rejects.toThrow(/پیدا نشد/);

    expect(await db().adminAuditLog.count()).toBe(0);
  });

  it("does not delete a collection for an unauthenticated request", async () => {
    const collection = await db().collection.create({ data: { name: "پیشنهاد", slug: "offers" } });

    await expect(
      controller().remove({ headers: { cookie: "kmodern_admin=bad" } } as never, collection.id),
    ).rejects.toThrow();

    expect(await db().collection.count()).toBe(1);
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

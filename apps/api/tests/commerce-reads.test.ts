// The panel's commerce reads, as the gateway serves them.
//
// Criterion 10 asks that the panel's pages read through the gateway and issue no database import of
// any kind. The reads themselves are the gateway's, so what is worth pinning here is the *shape*: a
// page that has to fold a row into the form's own shape is a translation the panel still holds, and a
// filter that is accepted and then ignored is worse than no filter at all.
//
// The panel's half — that these four pages no longer import the data tier, and that the order page
// does not recompute which transitions are legal — is asserted in
// apps/admin/src/lib/actions/commerce-reads.test.ts, where the source of a page can be read.

import { beforeEach, describe, expect, it } from "vitest";
import { ProductsController } from "../src/products/products.controller.js";
import { OrdersController } from "../src/orders/orders.controller.js";
import { OrdersService } from "../src/orders/orders.service.js";
import { allowedTransitions } from "../src/orders/order-transitions.js";
import { db } from "../src/prisma/index.js";
import { makeCategory, makeOrder, makeProduct, makeVariantOn, resetDatabase } from "./harness.js";

/** The query an unfiltered page sends, spelled out once so each test says only what it changes. */
function pageQuery(over: Record<string, unknown> = {}) {
  return { page: 1, size: 25, ...over } as never;
}

describe("the panel reads the product table", () => {
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
    return new ProductsController(auth, db() as never);
  };

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  it("answers each row with what the table prints, and the count of that page beside it", async () => {
    const category = await makeCategory("mobile", "موبایل");
    const product = await makeProduct({ name: "جارو", categoryId: category.id });
    await makeVariantOn(product.id, { sku: "sku-black" });

    const page = await controller().list(request(), pageQuery());

    // The category stays nested because the table's cell reads the name off the row it was given, and
    // the variant count crosses as a count rather than as the query that produced it.
    expect(page.products[0]).toMatchObject({
      id: product.id,
      name: "جارو",
      slug: product.slug,
      category: { id: category.id, name: "موبایل" },
      variantCount: 2,
    });
    expect(page.total).toBe(1);
  });

  it("filters by status", async () => {
    await makeProduct({ name: "منتشر", status: "PUBLISHED" });
    await makeProduct({ name: "پیش‌نویس", status: "DRAFT" });

    const page = await controller().list(request(), pageQuery({ status: "DRAFT" }));

    // The boundary, not "a list is not empty": the filtered-out row must be *absent* and the count
    // must describe only what survived, or the pager promises pages that hold rows from another filter.
    expect(page.products.map((row) => row.name)).toEqual(["پیش‌نویس"]);
    expect(page.total).toBe(1);
  });

  it("matches the search against brand and slug as well as the name, without regard to case", async () => {
    // The panel's box has always covered all four and has always matched case-insensitively. A search
    // that quietly stopped covering the brand reads as a shop with fewer products in it.
    await makeProduct({ name: "جارو", brand: "Datis", slug: "jareh" });
    await makeProduct({ name: "ماشین", brand: "پارس", slug: "mashin" });

    const byBrand = await controller().list(request(), pageQuery({ q: "dAtIs" }));
    expect(byBrand.products.map((row) => row.name)).toEqual(["جارو"]);

    const bySlug = await controller().list(request(), pageQuery({ q: "JAREH" }));
    expect(bySlug.products.map((row) => row.name)).toEqual(["جارو"]);

    const noMatch = await controller().list(request(), pageQuery({ q: "پارس" }));
    expect(noMatch.total).toBe(1);
  });

  it("filters by one category", async () => {
    const phones = await makeCategory("mobile", "موبایل");
    const other = await makeCategory("kitchen", "آشپزخانه");
    await makeProduct({ name: "گوشی", categoryId: phones.id });
    await makeProduct({ name: "یخچال", categoryId: other.id });

    const page = await controller().list(request(), pageQuery({ categoryId: phones.id }));

    expect(page.products.map((row) => row.name)).toEqual(["گوشی"]);
  });

  it("holds the page size, and answers with the one it used", async () => {
    await makeProduct({ name: "یک" });
    await makeProduct({ name: "دو" });
    await makeProduct({ name: "سه" });

    const page = await controller().list(request(), pageQuery({ size: 2 }));

    // The bound is proved by what came back, not by the constant: a route that reads whatever `size`
    // says is a route anything that can reach it can ask the whole catalogue of.
    expect(page.products).toHaveLength(2);
    expect(page.size).toBe(2);
    expect(page.total).toBe(3);
  });

  it("needs an operator, because it answers with the shop's management view", async () => {
    await makeProduct({ name: "جارو" });
    await expect(
      controller().list({ headers: { cookie: "kmodern_admin=bad" } } as never, pageQuery()),
    ).rejects.toThrow();
  });
});

describe("the panel reads one product for the edit form", () => {
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
    return new ProductsController(auth, db() as never);
  };

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  // The panel used to fold the spec rows into this record itself, in the page. A projection performed
  // by the client is one performed wrongly the first time somebody edits it, so the read has to
  // answer it — keyed by the spec field's id, which is the key the form's inputs are built from.
  it("answers the specification values already keyed by spec-field id", async () => {
    const category = await makeCategory("mobile", "موبایل");
    const weight = await db().categorySpecField.create({
      data: { categoryId: category.id, name: "وزن", type: "string" },
    });
    const colour = await db().categorySpecField.create({
      data: { categoryId: category.id, name: "رنگ", type: "string" },
    });
    const product = await makeProduct({ name: "گوشی", categoryId: category.id });
    await db().productSpecValue.create({ data: { productId: product.id, specFieldId: weight.id, value: "۲۰۰ گرم" } });
    await db().productSpecValue.create({ data: { productId: product.id, specFieldId: colour.id, value: "سفید" } });

    const detail = await controller().one(request(), product.id);

    expect(detail.specValues).toEqual({ [weight.id]: "۲۰۰ گرم", [colour.id]: "سفید" });
  });

  it("answers the variants in the order the form shows them, with no field renamed", async () => {
    const product = await makeProduct({ name: "گوشی" });
    const first = await makeVariantOn(product.id, { colorName: "آبی", sku: "blue" });
    await makeVariantOn(product.id, { colorName: "قرمز", sku: "red" });

    const detail = await controller().one(request(), product.id);

    // Alphabetical by colour — the order the form's rows arrive in, and a form seeded in a different
    // order than it renders is a form whose rows move on every refresh. The product fixture brings a
    // variant of its own, so the set is three, not two. The order itself is the database collation's,
    // which is what `orderBy: { colorName: "asc" }` means: this pins that the ordering is applied, not
    // that a particular alphabet is in charge of it.
    expect(detail.variants.map((v) => v.colorName)).toEqual(["آبی", "سفید", "قرمز"]);
    expect(detail.variants[0]).toMatchObject({ id: first.id, sku: "blue", colorCode: null, images: [] });
  });

  it("answers a product that is not there as absent, so the page can say notFound", async () => {
    await expect(controller().one(request(), "no-such-product")).rejects.toThrow(/پیدا نشد/);
  });

  it("needs an operator", async () => {
    const product = await makeProduct({ name: "جارو" });
    await expect(
      controller().one({ headers: { cookie: "kmodern_admin=bad" } } as never, product.id),
    ).rejects.toThrow();
  });
});

describe("the panel reads the order table", () => {
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
    return new OrdersController(new OrdersService(db() as never), auth, db() as never);
  };

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;
  const query = (over: Record<string, unknown> = {}) =>
    ({ limit: 25, offset: 0, ...over }) as never;

  it("carries the customer and the payment method, which are two of the seven columns", async () => {
    const customer = await db().customer.create({ data: { phone: "09120000001", name: "مریم" } });
    await makeOrder({ customerId: customer.id, total: 4_200_000 });

    const page = await controller().list(request(), query());

    expect(page.orders[0]?.customer).toEqual({ id: customer.id, name: "مریم", phone: "09120000001" });
    expect(page.orders[0]?.paymentMethod).toBe("ONLINE");
  });

  it("filters by the two statuses, and the count describes only what survived", async () => {
    const awaiting = await makeOrder();
    await db().order.update({ where: { id: awaiting.id }, data: { fulfillmentStatus: "PENDING" } });
    const shipped = await makeOrder();
    await db().order.update({ where: { id: shipped.id }, data: { fulfillmentStatus: "SHIPPED" } });

    const page = await controller().list(request(), query({ fulfillmentStatus: "SHIPPED" }));

    expect(page.orders.map((row) => row.id)).toEqual([shipped.id]);
    expect(page.total).toBe(1);

    const byPayment = await controller().list(request(), query({ paymentStatus: "PAID" }));
    expect(byPayment.total).toBe(0);
  });

  // The term matches an order number *or* a customer's phone, and has always done so without regard
  // to case. A search that quietly stopped matching either reads as a shop with fewer orders in it.
  it("matches the term against the order number and the phone, without regard to case", async () => {
    const customer = await db().customer.create({ data: { phone: "09120000009" } });
    const wanted = await makeOrder({ customerId: customer.id });
    await makeOrder();

    const byNumber = await controller().list(request(), query({ q: wanted.orderNumber.toUpperCase() }));
    expect(byNumber.orders.map((row) => row.id)).toEqual([wanted.id]);

    const byPhone = await controller().list(request(), query({ q: "09120000009" }));
    expect(byPhone.orders.map((row) => row.id)).toEqual([wanted.id]);
  });

  it("pages rather than answering everything at once", async () => {
    // Placed a day apart on purpose. `placedAt` is a `now()` default, and two orders placed inside
    // the same clock tick share one — which would make "newest first" a coin toss rather than an
    // assertion about paging.
    const older = await makeOrder();
    const newer = await makeOrder();
    await db().order.update({ where: { id: older.id }, data: { placedAt: new Date("2026-01-01T09:00:00Z") } });
    await db().order.update({ where: { id: newer.id }, data: { placedAt: new Date("2026-01-02T09:00:00Z") } });

    const firstPage = await controller().list(request(), query({ limit: 1, offset: 0 }));
    const secondPage = await controller().list(request(), query({ limit: 1, offset: 1 }));

    // The two halves of one assertion: a limit that is honoured and an offset that moves. A page that
    // answered the same first row twice would satisfy a length check on its own.
    expect(firstPage.orders.map((row) => row.id)).toEqual([newer.id]);
    expect(secondPage.orders.map((row) => row.id)).toEqual([older.id]);
    expect(firstPage.total).toBe(2);
  });

  it("needs an operator", async () => {
    await makeOrder();
    await expect(
      controller().list({ headers: { cookie: "kmodern_admin=bad" } } as never, query()),
    ).rejects.toThrow();
  });
});

describe("the panel reads one order for the order page", () => {
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
    return new OrdersController(new OrdersService(db() as never), auth, db() as never);
  };

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  // The whole point of the read: the form is rendered from what the server says it will accept, so
  // the answer has to be the table the server enforces. Compared against that table rather than
  // against a copied list, so a change to the table fails here rather than passing quietly.
  it("answers the legal transitions from the table the status write enforces", async () => {
    const order = await makeOrder();
    await db().order.update({
      where: { id: order.id },
      data: { fulfillmentStatus: "CONFIRMED", paymentStatus: "PAID" },
    });

    const detail = await controller().one(request(), order.id);

    expect(detail.transitions.fulfillment).toEqual([
      ...allowedTransitions("FULFILLMENT", "CONFIRMED"),
    ]);
    expect(detail.transitions.payment).toEqual([...allowedTransitions("PAYMENT", "PAID")]);
  });

  it("answers a terminal order with nothing to offer, rather than with a guess", async () => {
    const order = await makeOrder();
    await db().order.update({
      where: { id: order.id },
      data: { fulfillmentStatus: "RETURNED", paymentStatus: "REFUNDED" },
    });

    const detail = await controller().one(request(), order.id);

    // An empty list is the gateway saying this status is final. The page must not fill it in.
    expect(detail.transitions).toEqual({ fulfillment: [], payment: [] });
  });

  it("answers the total as the row wrote it, with the parts that make it up beside it", async () => {
    const customer = await db().customer.create({ data: { phone: "09120000002", name: "رضا" } });
    const order = await makeOrder({ customerId: customer.id, total: 0 });
    await db().order.update({
      where: { id: order.id },
      data: { subtotal: 5_000_000, discountAmount: 500_000, deliveryFee: 200_000, total: 4_700_000 },
    });

    const detail = await controller().one(request(), order.id);

    // The page prints how the total was reached, and it prints the server's total. A factor applied
    // on the way across is how a shop and its own invoice end up disagreeing, so the sum is asserted
    // rather than the number.
    expect(detail.total).toBe(4_700_000);
    expect(detail.subtotal - detail.discountAmount + detail.deliveryFee).toBe(detail.total);
    expect(detail.customer).toEqual({
      id: customer.id,
      name: "رضا",
      phone: "09120000002",
      email: null,
    });
  });

  // The address is a `Json` snapshot and the panel cast it to a record of strings. A snapshot that is
  // missing a key must read as absent, not as the word "undefined" inside a delivery address.
  it("answers each address field as a string or as nothing", async () => {
    const order = await makeOrder();
    await db().order.update({
      where: { id: order.id },
      data: { shippingAddress: { province: "تهران", city: "تهران", recipientPhone: 42 } },
    });

    const detail = await controller().one(request(), order.id);

    expect(detail.shippingAddress).toEqual({
      province: "تهران",
      city: "تهران",
      addressLine: null,
      recipientName: null,
      recipientPhone: null,
      postalCode: null,
    });
  });

  it("carries the stock holds behind the order", async () => {
    const product = await makeProduct({ name: "جارو" });
    const variant = await makeVariantOn(product.id);
    const order = await makeOrder();
    await db().stockReservation.create({
      data: { orderId: order.id, variantId: variant.id, qty: 2, expiresAt: new Date("2027-01-01") },
    });

    const detail = await controller().one(request(), order.id);

    expect(detail.reservations).toHaveLength(1);
    expect(detail.reservations[0]).toMatchObject({ qty: 2, status: "ACTIVE" });
  });

  it("answers an order that is not there as absent, so the page can say notFound", async () => {
    await expect(controller().one(request(), "no-such-order")).rejects.toThrow(/پیدا نشد/);
  });

  it("needs an operator", async () => {
    const order = await makeOrder();
    await expect(
      controller().one({ headers: { cookie: "kmodern_admin=bad" } } as never, order.id),
    ).rejects.toThrow();
  });
});

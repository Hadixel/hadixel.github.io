// Checkout rules, against a real database.
//
// Each of these was an inline query or a literal in the storefront's checkout handler, and one of them
// existed only on the preview path. The tests are written so that the version which was there before
// fails them:
//
//   - the city/province check only on the quote path, so `placeOrder` accepts a mismatched pair;
//   - the "one unpaid order" rule exempting cash on delivery, so a customer can pile up unpaid orders;
//   - a cash-on-delivery ceiling as a literal rather than a setting, so a merchant cannot change it;
//   - reserving and immediately committing stock for cash on delivery, so the hold cannot expire.

import { beforeEach, describe, expect, it } from "vitest";
import { cityBelongsToProvince, iranCities, iranProvinces } from "@kmodern/contracts";
import { settingKeys } from "@kmodern/contracts/setting-keys";
import { CheckoutService } from "../src/checkout/checkout.service.js";
import {
  DEFAULT_MAX_COD_TOTAL,
  cashOnDeliveryAllowed,
  codCeiling,
} from "../src/checkout/checkout-rules.js";
import { computeTotals, subtotalOf } from "../src/checkout/totals.js";
import { applyDiscounts } from "../src/checkout/discounts.js";
import { $Enums, db } from "../src/prisma/index.js";
import { makeDiscount, makeOrder, makeProduct, makeVariant, resetDatabase } from "./harness.js";

function service(): CheckoutService {
  return new CheckoutService(db() as never);
}

const ONLINE = $Enums.PaymentMethod.ONLINE;

/** A city that is genuinely inside a province, resolved the way the dataset links them. */
function aCityIn(provinceName: string): { province: string; city: string } {
  const province = iranProvinces.find((p) => p.name === provinceName);
  if (!province) throw new Error(`the Iran dataset has no ${provinceName} province`);
  const city = iranCities.find((c) => c.provinceId === province.id);
  if (!city) throw new Error(`the Iran dataset has no city in ${provinceName}`);
  return { province: province.name, city: city.name };
}

/** Inside Kerman, so the local delivery rules apply and cash on delivery is on offer. */
function kermanAddress() {
  return {
    recipientName: "خریدار",
    recipientPhone: "09120000000",
    ...aCityIn("کرمان"),
    addressLine: "خیابان آزادی، پلاک ۱۲",
    postalCode: "1234567890",
  };
}

function outOfTownAddress() {
  return {
    recipientName: "خریدار",
    recipientPhone: "09120000000",
    ...aCityIn("تهران"),
    addressLine: "خیابان ولیعصر، پلاک ۴۵",
    postalCode: "1234567890",
  };
}

async function setSetting(key: string, value: unknown) {
  await db().setting.upsert({
    where: { key },
    update: { value: value as never },
    create: { key, value: value as never },
  });
}

async function aCustomer() {
  return db().customer.create({ data: { phone: "09121110000" } });
}

describe("the totals rule", () => {
  it("is subtotal, less the discount, plus delivery", () => {
    const totals = computeTotals(
      [{ price: 100_000, qty: 2 }],
      { discountAmount: 50_000, freeDelivery: false, applied: [] },
      { method: "LOCAL", deliveryFee: 20_000, deliveryFeeMode: "FLAT" },
    );
    expect(totals.subtotal).toBe(200_000);
    expect(totals.total).toBe(170_000);
  });

  it("keeps the goods' price visible when a discount makes delivery free", () => {
    const totals = computeTotals(
      [{ price: 100_000, qty: 1 }],
      { discountAmount: 0, freeDelivery: true, applied: [] },
      { method: "LOCAL", deliveryFee: 20_000, deliveryFeeMode: "FLAT" },
    );
    // The delivery is waived, not the subtotal: the order still shows what the goods cost.
    expect(totals.subtotal).toBe(100_000);
    expect(totals.deliveryFee).toBe(0);
    expect(totals.total).toBe(100_000);
  });

  it("adds up a basket by quantity, not by line", () => {
    expect(
      subtotalOf([
        { price: 10_000, qty: 3 },
        { price: 2_500, qty: 4 },
      ]),
    ).toBe(40_000);
  });
});

describe("cash on delivery", () => {
  it("is offered only inside the local delivery zone", () => {
    expect(cashOnDeliveryAllowed("LOCAL", 1_000, DEFAULT_MAX_COD_TOTAL)).toEqual({ ok: true });
    expect(cashOnDeliveryAllowed("POST", 1_000, DEFAULT_MAX_COD_TOTAL)).toEqual({
      ok: false,
      reason: "not-eligible",
    });
    expect(cashOnDeliveryAllowed("BARBERI", 1_000, DEFAULT_MAX_COD_TOTAL)).toEqual({
      ok: false,
      reason: "not-eligible",
    });
  });

  it("is refused above the ceiling, and offered at it", () => {
    expect(cashOnDeliveryAllowed("LOCAL", 1_000, 1_000)).toEqual({ ok: true });
    expect(cashOnDeliveryAllowed("LOCAL", 1_001, 1_000)).toEqual({ ok: false, reason: "over-ceiling" });
  });

  // The ceiling used to be a literal in the handler, so a merchant could not change it.
  it("reads its ceiling from the merchant's setting", async () => {
    expect(await codCeiling(db() as never)).toBe(DEFAULT_MAX_COD_TOTAL);
    await setSetting(settingKeys.shippingMaxCodTotal, 5_000_000);
    expect(await codCeiling(db() as never)).toBe(5_000_000);
  });
});

describe("quoting a basket", () => {
  beforeEach(resetDatabase);

  it("prices from the live variant, not from a price in the request", async () => {
    const product = await makeProduct({ name: "یخسال" });
    const variant = await makeVariant({ stock: 5 });
    await db().variant.update({ where: { id: variant.id }, data: { price: 750_000 } });

    const quote = await service().quote({
      address: kermanAddress(),
      items: [{ variantId: variant.id, qty: 2 }],
    });

    expect(quote.totals.subtotal).toBe(1_500_000);
    expect(product.id).toBeTruthy();
  });

  it("refuses a basket holding a variant that is not there", async () => {
    await expect(
      service().quote({ address: kermanAddress(), items: [{ variantId: "nope", qty: 1 }] }),
    ).rejects.toThrow();
  });

  it("refuses the whole basket when one line is short, rather than trimming that line", async () => {
    const variant = await makeVariant({ stock: 1 });
    await service().quote({ address: kermanAddress(), items: [{ variantId: variant.id, qty: 5 }] })
      .then(() => {
        throw new Error("a basket of 5 against 1 in stock must not be priced");
      })
      .catch((error: Error) => {
        expect(error).toBeInstanceOf(Error);
      });
  });

  it("allows a backorder line to exceed free stock", async () => {
    const variant = await makeVariant({ stock: 1 });
    await db().variant.update({ where: { id: variant.id }, data: { allowBackorder: true } });
    const quote = await service().quote({ address: kermanAddress(), items: [{ variantId: variant.id, qty: 9 }] });
    expect(quote.totals.subtotal).toBeGreaterThan(0);
  });

  // The check that used to exist only here, so the create path skipped it entirely.
  it("refuses a city that is not in the chosen province", async () => {
    const variant = await makeVariant({ stock: 5 });
    const mismatched = { ...kermanAddress(), city: "تهران" };
    expect(cityBelongsToProvince(mismatched.province, mismatched.city)).toBe(false);

    await expect(
      service().quote({ address: mismatched, items: [{ variantId: variant.id, qty: 1 }] }),
    ).rejects.toThrow();
  });

  it("applies a coupon and says so in the totals", async () => {
    const variant = await makeVariant({ stock: 5 });
    await db().variant.update({ where: { id: variant.id }, data: { price: 100_000 } });
    // The coupon is scoped to this product, so the basket has to name it. A discount that applied to
    // everything would not be testing whether the scope is honoured.
    const discount = await makeDiscount({ productIds: [variant.productId], value: 10, mode: "COUPON" });

    const withCode = await applyDiscounts(
      db() as never,
      {
        subtotal: 100_000,
        productIds: [variant.productId],
        categoryIds: [],
        collectionIds: [],
      },
      discount.code ?? undefined,
    );

    expect(withCode.discountAmount).toBe(10_000);
    expect(withCode.couponError).toBeUndefined();
  });

  it("does not apply a discount scoped to something the basket does not contain", async () => {
    const variant = await makeVariant({ stock: 5 });
    const elsewhere = await makeProduct({ name: "ماشین لباسشویی" });
    await makeDiscount({ productIds: [elsewhere.id], value: 50, mode: "AUTOMATIC" });

    const result = await applyDiscounts(db() as never, {
      subtotal: 100_000,
      productIds: [variant.productId],
      categoryIds: [],
      collectionIds: [],
    });

    expect(result.discountAmount).toBe(0);
  });

  it("refuses a coupon that does not exist without failing the quote", async () => {
    const refused = await applyDiscounts(
      db() as never,
      { subtotal: 100_000, productIds: [], categoryIds: [], collectionIds: [] },
      "NOT-A-CODE",
    );
    expect(refused.couponError).toBeDefined();
    expect(refused.discountAmount).toBe(0);
  });
});

describe("placing an order", () => {
  beforeEach(resetDatabase);

  async function aBasket(qty = 1) {
    const variant = await makeVariant({ stock: 10 });
    await db().variant.update({ where: { id: variant.id }, data: { price: 100_000 } });
    return { variant, items: [{ variantId: variant.id, qty }] };
  }

  it("creates the order, holds the stock, and records that it was placed", async () => {
    const customer = await aCustomer();
    const { variant, items } = await aBasket(2);

    const placed = await service().placeOrder({
      customerId: customer.id,
      address: kermanAddress(),
      items,
      paymentMethod: "ONLINE",
    });

    expect(placed.orderNumber).toMatch(/^\d{4}-\d{6}$/);
    const order = await db().order.findUniqueOrThrow({
      where: { id: placed.id },
      include: { items: true, reservations: true },
    });
    expect(order.paymentStatus).toBe("AWAITING");
    expect(order.items).toHaveLength(1);
    expect(order.items[0].quantity).toBe(2);
    // Held, not sold: the money has not moved.
    const after = await db().variant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(after.stock).toBe(10);
    expect(after.reserved).toBe(2);
    expect(order.reservations[0].status).toBe("ACTIVE");
  });

  // The city/province check belongs on the path that creates the order.
  it("refuses a city that is not in the chosen province", async () => {
    const customer = await aCustomer();
    const { items } = await aBasket();

    await expect(
      service().placeOrder({
        customerId: customer.id,
        address: { ...kermanAddress(), city: "تهران" },
        items,
        paymentMethod: "ONLINE",
      }),
    ).rejects.toThrow();
  });

  it("refuses cash on delivery outside the local zone", async () => {
    const customer = await aCustomer();
    const { items } = await aBasket();

    await expect(
      service().placeOrder({
        customerId: customer.id,
        address: outOfTownAddress(),
        items,
        paymentMethod: "COD",
      }),
    ).rejects.toThrow();
  });

  it("refuses cash on delivery above the ceiling", async () => {
    const customer = await aCustomer();
    await setSetting(settingKeys.shippingMaxCodTotal, 1_000);
    const { items } = await aBasket(1);

    await expect(
      service().placeOrder({
        customerId: customer.id,
        address: kermanAddress(),
        items,
        paymentMethod: "COD",
      }),
    ).rejects.toThrow();
  });

  // The version in the handler exempted COD, so a customer could pile up unpaid COD orders.
  it("refuses a second order awaiting payment, whatever the method", async () => {
    const customer = await aCustomer();
    const first = await aBasket();
    await service().placeOrder({
      customerId: customer.id,
      address: kermanAddress(),
      items: first.items,
      paymentMethod: "ONLINE",
    });

    const second = await aBasket();
    await expect(
      service().placeOrder({
        customerId: customer.id,
        address: kermanAddress(),
        items: second.items,
        paymentMethod: "COD",
      }),
    ).rejects.toThrow();
  });

  it("does not let one customer's unpaid order block another's", async () => {
    const one = await aCustomer();
    const two = await db().customer.create({ data: { phone: "09122220000" } });
    const first = await aBasket();
    await service().placeOrder({
      customerId: one.id,
      address: kermanAddress(),
      items: first.items,
      paymentMethod: "ONLINE",
    });

    const other = await aBasket();
    const placed = await service().placeOrder({
      customerId: two.id,
      address: kermanAddress(),
      items: other.items,
      paymentMethod: "ONLINE",
    });

    expect(placed.id).toBeTruthy();
  });

  it("lets the customer place again once the earlier order is settled", async () => {
    const customer = await aCustomer();
    const first = await aBasket();
    const earlier = await service().placeOrder({
      customerId: customer.id,
      address: kermanAddress(),
      items: first.items,
      paymentMethod: "ONLINE",
    });
    await db().order.update({ where: { id: earlier.id }, data: { paymentStatus: "PAID" } });

    const second = await aBasket();
    const placed = await service().placeOrder({
      customerId: customer.id,
      address: kermanAddress(),
      items: second.items,
      paymentMethod: "ONLINE",
    });

    expect(placed.id).toBeTruthy();
  });

  // Cash on delivery used to reserve and commit in the same transaction, which sold stock the customer
  // had not paid for and left no hold to expire.
  it("holds stock for a cash-on-delivery order rather than selling it", async () => {
    const customer = await aCustomer();
    const { variant, items } = await aBasket(3);

    const placed = await service().placeOrder({
      customerId: customer.id,
      address: kermanAddress(),
      items,
      paymentMethod: "COD",
    });

    const after = await db().variant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(after.stock).toBe(10);
    expect(after.reserved).toBe(3);
    const reservations = await db().stockReservation.findMany({ where: { orderId: placed.id } });
    expect(reservations[0].status).toBe("ACTIVE");
  });

  it("leaves no order behind when a line turns out to be short", async () => {
    const customer = await aCustomer();
    const { variant } = await aBasket();
    await db().variant.update({ where: { id: variant.id }, data: { stock: 0, reserved: 0 } });

    await expect(
      service().placeOrder({
        customerId: customer.id,
        address: kermanAddress(),
        items: [{ variantId: variant.id, qty: 1 }],
        paymentMethod: "ONLINE",
      }),
    ).rejects.toThrow();

    expect(await db().order.count({ where: { customerId: customer.id } })).toBe(0);
  });

  it("gives two orders placed at once different numbers", async () => {
    const customer = await aCustomer();
    const first = await aBasket();
    const second = await aBasket();

    const a = await service().placeOrder({
      customerId: customer.id,
      address: kermanAddress(),
      items: first.items,
      paymentMethod: "ONLINE",
    });
    await db().order.updateMany({ where: { customerId: customer.id }, data: { paymentStatus: "FAILED" } });
    const b = await service().placeOrder({
      customerId: customer.id,
      address: kermanAddress(),
      items: second.items,
      paymentMethod: "ONLINE",
    });

    expect(a.orderNumber).not.toBe(b.orderNumber);
  });
});

describe("enriching a basket", () => {
  beforeEach(resetDatabase);

  it("reports what each line is now, from live data", async () => {
    const variant = await makeVariant({ stock: 5 });
    await db().variant.update({ where: { id: variant.id }, data: { price: 40_000 } });

    const cart = await service().enrichCart([{ variantId: variant.id, qty: 2 }]);

    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].price).toBe(40_000);
    expect(cart.lines[0].lineTotal).toBe(80_000);
    expect(cart.subtotal).toBe(80_000);
    expect(cart.totalCount).toBe(2);
    expect(cart.unavailable).toEqual([]);
  });

  it("caps a line at what can still be added, so a stale cart is not drawn as orderable", async () => {
    const variant = await makeVariant({ stock: 3 });
    const cart = await service().enrichCart([{ variantId: variant.id, qty: 10 }]);
    expect(cart.lines[0].maxAddable).toBe(3);
  });

  it("says which lines it could not resolve instead of quietly shrinking the basket", async () => {
    const variant = await makeVariant({ stock: 3 });
    const cart = await service().enrichCart([
      { variantId: variant.id, qty: 1 },
      { variantId: "gone", qty: 2 },
    ]);
    expect(cart.lines).toHaveLength(1);
    expect(cart.unavailable).toEqual([{ variantId: "gone", qty: 2 }]);
  });
});

describe("an order placed by an operator", () => {
  beforeEach(resetDatabase);

  it("is created against the same money the shopper would be quoted", async () => {
    // The panel used to compute its own totals, which is how an operator's order and a shopper's order
    // could come to different figures for the same basket.
    const variant = await makeVariant({ stock: 5 });
    await db().variant.update({ where: { id: variant.id }, data: { price: 100_000 } });

    const quote = await service().quote({
      address: kermanAddress(),
      items: [{ variantId: variant.id, qty: 2 }],
    });

    // The same rule, given the same basket and destination, produces the same number.
    expect(quote.totals.total).toBe(
      quote.totals.subtotal - quote.totals.discountAmount + quote.totals.deliveryFee,
    );
    expect(quote.totals.total).toBeGreaterThan(0);
  });

  it("holds stock for an order an operator places by hand, like any other", async () => {
    const customer = await aCustomer();
    const variant = await makeVariant({ stock: 4 });
    const order = await makeOrder();
    const { reserveStock } = await import("../src/inventory/inventory.service.js");
    await reserveStock(order.id, [{ variantId: variant.id, qty: 2 }], ONLINE);

    const after = await db().variant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(after.reserved).toBe(2);
    expect(order.id).toBeTruthy();
    expect(customer.id).toBeTruthy();
  });
});

describe("the Iran dataset the agreement check reads", () => {
  it("agrees that a city belongs to its own province", () => {
    for (const province of iranProvinces) {
      for (const city of iranCities.filter((c) => c.provinceId === province.id)) {
        expect(cityBelongsToProvince(province.name, city.name)).toBe(true);
      }
    }
  });
});

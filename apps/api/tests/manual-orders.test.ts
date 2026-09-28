// The operator-placed order, as the gateway applies it.
//
// This was a transaction in the panel. What made it worth moving rather than leaving was not tidiness:
// it allocated the order number from a *second* implementation of the counter, so the panel and the
// checkout were two ways of asking for the next number and could hand the same one to two orders. And
// its rules — the line cap, the quantity bounds, the duplicate-variant scan — ran in the action, where
// they were a fast-fail in a client rather than a rule the server enforced.
//
// So these tests hold two things: that the order is right, and that the rules are the gateway's.

import { beforeEach, describe, expect, it } from "vitest";
import { OrdersService } from "../src/orders/orders.service.js";
import { OrderRuleViolation } from "../src/orders/exceptions/order.exception.js";
import { ManualOrderDto } from "../src/orders/dto/manual-order.dto.js";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { db } from "../src/prisma/index.js";
import { makeVariant, resetDatabase } from "./harness.js";

function service(): OrdersService {
  return new OrdersService(db() as never);
}

const ADDRESS = {
  recipientName: "خریدار",
  recipientPhone: "09121234567",
  province: "تهران",
  city: "تهران",
  line1: "خیابان آزادی",
  postalCode: "1458963254",
  isDefault: false,
};

/**
 * One variant, priced and stocked.
 *
 * `makeVariant` creates its own product and fixes the price, so the price is set here rather than
 * passed in — a fixture whose price argument is ignored is worse than one that has no price argument.
 */
async function aVariant(stock = 50, price = 1_000_000) {
  const variant = await makeVariant({ stock });
  return db().variant.update({ where: { id: variant.id }, data: { price } });
}

/**
 * The DTO's own validation, which is what the request goes through.
 *
 * Every constraint message in the tree, flattened. Asserting on the messages rather than on class-
 * validator's nesting is deliberate: the depth of `children` is the library's reporting style, and a
 * test that pins it fails when the library changes while the rule is still enforced.
 */
function messages(body: unknown): string[] {
  const errors = validateSync(plainToInstance(ManualOrderDto, body));
  const out: string[] = [];
  const walk = (nodes: ReturnType<typeof validateSync>) => {
    for (const node of nodes) {
      for (const value of Object.values(node.constraints ?? {})) out.push(value);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(errors);
  return out;
}

/** The properties the validation failed on, at any depth. */
function failedProperties(body: unknown): string[] {
  const errors = validateSync(plainToInstance(ManualOrderDto, body));
  const out: string[] = [];
  const walk = (nodes: ReturnType<typeof validateSync>) => {
    for (const node of nodes) {
      out.push(node.property);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(errors);
  return out;
}

function manual(over: Record<string, unknown> = {}) {
  return {
    customerId: "unused",
    address: ADDRESS,
    paymentMethod: "ONLINE" as const,
    shippingMethod: "LOCAL" as const,
    deliveryFeeMode: "FLAT" as const,
    deliveryFee: 50_000,
    adminNote: null,
    lines: [{ variantId: "unused", qty: 1 }],
    actor: "owner@example.test",
    ...over,
  };
}

async function aCustomer() {
  return db().customer.create({ data: { phone: "09121234567", name: "خریدار" } });
}

beforeEach(resetDatabase);

describe("placing an order for an operator", () => {
  it("numbers it from the same counter the checkout uses", async () => {
    const customer = await aCustomer();
    const variant = await aVariant();

    const created = await service().createManualOrder(
      manual({ customerId: customer.id, lines: [{ variantId: variant.id, qty: 1 }] }),
    );

    // The panel used a second counter implementation, so the number that proved the move is the one
    // that is absent from the counter row afterwards — a second counter would have left it untouched.
    const counter = await db().orderNumberCounter.findFirstOrThrow();
    expect(counter.lastNumber).toBe(1);
    expect(created.orderNumber).toBe(counter.jalaliYear + "-000001");
  });

  it("prices the lines itself and adds the quoted fee", async () => {
    const customer = await aCustomer();
    const variant = await aVariant(50, 1_000_000);

    const { id } = await service().createManualOrder(
      manual({ customerId: customer.id, deliveryFee: 50_000, lines: [{ variantId: variant.id, qty: 3 }] }),
    );

    const order = await db().order.findUniqueOrThrow({ where: { id }, include: { items: true } });
    expect(order.subtotal).toBe(3_000_000);
    expect(order.deliveryFee).toBe(50_000);
    expect(order.total).toBe(3_050_000);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].lineTotal).toBe(3_000_000);
  });

  it("holds the stock rather than selling it, for a method that has not been paid", async () => {
    const customer = await aCustomer();
    const variant = await aVariant(10, 1_000_000);

    const { id } = await service().createManualOrder(
      manual({ customerId: customer.id, lines: [{ variantId: variant.id, qty: 4 }] }),
    );

    // A hold is a hold: the units are still on the shelf and still sellable, and what is promised is
    // `reserved`. The stock column only moves when the hold is committed.
    const after = await db().variant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(after.stock).toBe(10);
    expect(after.reserved).toBe(4);
    expect(after.stock - after.reserved).toBe(6);
    const order = await db().order.findUniqueOrThrow({ where: { id } });
    expect(order.paymentStatus).toBe("AWAITING");
  });

  it("commits the stock immediately for cash on delivery, because the money changed hands", async () => {
    const customer = await aCustomer();
    const variant = await aVariant(10, 1_000_000);

    const { id } = await service().createManualOrder(
      manual({ customerId: customer.id, paymentMethod: "COD", lines: [{ variantId: variant.id, qty: 4 }] }),
    );

    const after = await db().variant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(after.stock).toBe(6);
    // Committed, not held: nothing is waiting to be paid, so a reservation would be a hold that only
    // the operator could release and the order has no reason to be waiting.
    expect(after.reserved).toBe(0);
    const order = await db().order.findUniqueOrThrow({ where: { id } });
    expect(order.paymentStatus).toBe("PAID");
  });

  it("records the payment event for cash on delivery and not otherwise", async () => {
    const customer = await aCustomer();
    const variant = await aVariant();

    const cod = await service().createManualOrder(
      manual({ customerId: customer.id, paymentMethod: "COD", lines: [{ variantId: variant.id, qty: 1 }] }),
    );
    const online = await service().createManualOrder(
      manual({ customerId: customer.id, paymentMethod: "ONLINE", lines: [{ variantId: variant.id, qty: 1 }] }),
    );

    const events = await db().orderStatusEvent.findMany({ where: { orderId: { in: [cod.id, online.id] } } });
    const paymentFor = (id: string) => events.filter((e) => e.orderId === id && e.dimension === "PAYMENT").length;
    expect(paymentFor(cod.id)).toBe(1);
    expect(paymentFor(online.id)).toBe(0);
  });

  it("writes the audit line naming the order it made", async () => {
    const customer = await aCustomer();
    const variant = await aVariant();

    const { id, orderNumber } = await service().createManualOrder(
      manual({ customerId: customer.id, lines: [{ variantId: variant.id, qty: 1 }] }),
    );

    const line = await db().adminAuditLog.findFirstOrThrow({ where: { action: "ORDER_CREATED_MANUAL" } });
    expect(line.entityId).toBe(id);
    expect(line.meta).toMatchObject({ orderNumber, paymentMethod: "ONLINE" });
  });

  it("refuses a customer it cannot find, and says which thing was wrong", async () => {
    const variant = await aVariant();
    await expect(
      service().createManualOrder(manual({ customerId: "no-such-customer", lines: [{ variantId: variant.id, qty: 1 }] })),
    ).rejects.toBeInstanceOf(OrderRuleViolation);
  });

  it("refuses a variant it cannot find rather than pricing a line it did not read", async () => {
    const customer = await aCustomer();
    await expect(
      service().createManualOrder(manual({ customerId: customer.id, lines: [{ variantId: "no-such-variant", qty: 1 }] })),
    ).rejects.toMatchObject({ code: "VARIANT_NOT_FOUND" });
  });

  it("leaves no order and no number behind when it refuses", async () => {
    const customer = await aCustomer();
    await expect(
      service().createManualOrder(manual({ customerId: customer.id, lines: [{ variantId: "no-such-variant", qty: 1 }] })),
    ).rejects.toThrow();

    // The counter is allocated inside the transaction, so a refusal has to roll it back — otherwise a
    // failed manual order would leave a gap in the shop's order numbers for the rest of the year.
    expect(await db().order.count()).toBe(0);
    expect(await db().orderNumberCounter.count()).toBe(0);
  });

  it("refuses more stock than there is, and takes none of it", async () => {
    const customer = await aCustomer();
    const variant = await aVariant(2, 1_000_000);

    await expect(
      service().createManualOrder(manual({ customerId: customer.id, lines: [{ variantId: variant.id, qty: 5 }] })),
    ).rejects.toThrow();

    const after = await db().variant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(after.stock).toBe(2);
    expect(after.reserved).toBe(0);
  });
});

describe("the bounds are the gateway's", () => {
  // These ran in the panel's action before. A caller that skipped the action had none of them, which
  // is what "a rule the server can enforce" has to mean.
  it("refuses an order with no lines", () => {
    expect(messages(manual({ lines: [] }))).toContain("حداقل یک آیتم اضافه کنید.");
  });

  it("refuses a quantity that is not a whole number of things", () => {
    // A fraction is refused as a fraction — a half of a kettle is not an order line, and rounding it
    // silently would put a quantity on the order that nobody chose.
    expect(messages(manual({ lines: [{ variantId: "v", qty: 1.5 }] }))).toContain(
      "تعداد باید عدد صحیح باشد.",
    );
  });

  it("refuses a quantity of zero or less", () => {
    for (const qty of [0, -3]) {
      expect(messages(manual({ lines: [{ variantId: "v", qty }] })), `qty ${qty}`).toContain(
        "تعداد باید حداقل ۱ باشد.",
      );
    }
  });

  it("refuses an absurd quantity of one variant", () => {
    expect(messages(manual({ lines: [{ variantId: "v", qty: 1_000_001 }] }))).toContain(
      "تعداد یک تنوع بیش از حد است.",
    );
  });

  it("refuses more lines than a telephone order has", () => {
    const lines = Array.from({ length: 101 }, (_, i) => ({ variantId: `v${i}`, qty: 1 }));
    expect(messages(manual({ lines }))).toContain("تعداد آیتم‌های سفارش بیش از حد است.");
  });

  it("refuses a method that is not one the shop takes", () => {
    for (const over of [{ paymentMethod: "CRYPTO" }, { shippingMethod: "PIGEON" }, { deliveryFeeMode: "FREE_REALTIME" }]) {
      expect(failedProperties(manual(over)).length, JSON.stringify(over)).toBeGreaterThan(0);
    }
  });

  it("refuses a negative delivery fee", () => {
    expect(messages(manual({ deliveryFee: -1 }))).toContain("هزینه ارسال نامعتبر است.");
  });

  it("refuses a note longer than the column", () => {
    expect(messages(manual({ adminNote: "x".repeat(2001) }))).toContain("یادداشت ادمین بیش از حد طولانی است.");
  });
});

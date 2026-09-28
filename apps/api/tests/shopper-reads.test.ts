// The shopper's own reads, and the boundary they must not cross.
//
// This is the one slice where a mistake hands a stranger somebody's order, so the centre of the file
// is a customer A asking for customer B's order and being told nothing about it — by id and by order
// number, which are the two keys a shopper's own links use. Refusing with 403 would fail both of
// those: it names the order as real.
//
// A test that only shows an anonymous call is refused proves nothing here, because the attacker in
// this story is signed in with somebody else's perfectly valid session.

import { beforeEach, describe, expect, it } from "vitest";
import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { reserveStock } from "../src/inventory/inventory.service.js";
import { OrdersController } from "../src/orders/orders.controller.js";
import { ShopperController } from "../src/shopper/shopper.controller.js";
import { ShopperService } from "../src/shopper/shopper.service.js";
import { OrdersService } from "../src/orders/orders.service.js";
import { PaymentAuthorityDto } from "../src/shopper/dto/payment-window.dto.js";
import { VALIDATION_PIPE_OPTIONS } from "../src/common/validation.js";
import { $Enums, db } from "../src/prisma/index.js";
import { makeOrder, makeVariant, readVariant, resetDatabase } from "./harness.js";

const PaymentStatus = $Enums.PaymentStatus;
const ReservationStatus = $Enums.ReservationStatus;

const A_TOKEN = "token-of-a";
const B_TOKEN = "token-of-b";

/** A session per customer, so "signed in as A" is a fact about the fixture and not about a token. */
async function twoCustomers() {
  // Not the `0912` prefix the harness mints its own customers under: these two have to coexist with
  // the orders `makeOrder` creates, and a fixture phone that collides with one of those is a unique
  // constraint failure that looks like nothing to do with the test.
  const a = await db().customer.create({ data: { phone: "09350000001", name: "الف" } });
  const b = await db().customer.create({ data: { phone: "09350000002", name: "ب" } });
  const auth = {
    customerForToken: async (token: string) => {
      if (token === A_TOKEN) return { customer: { id: a.id, phone: a.phone } };
      if (token === B_TOKEN) return { customer: { id: b.id, phone: b.phone } };
      return null;
    },
  };
  return {
    a,
    b,
    auth,
    asA: { headers: { cookie: `kmodern_customer=${A_TOKEN}` } } as never,
    asB: { headers: { cookie: `kmodern_customer=${B_TOKEN}` } } as never,
    anonymous: { headers: { cookie: "" } } as never,
  };
}

function shopper(auth: unknown) {
  return new ShopperController(
    new ShopperService(new OrdersService(db() as never), db() as never),
    auth as never,
  );
}

function ordersController(auth: unknown) {
  return new OrdersController(new OrdersService(db() as never), auth as never, db() as never);
}

/** A line on an order, so the detail read has something to render. */
async function addLine(orderId: string, opts: { unitPrice: number; quantity: number }) {
  return db().orderItem.create({
    data: {
      orderId,
      productName: "جارو",
      colorName: "سفید",
      sku: "SKU-1",
      unitPrice: opts.unitPrice,
      quantity: opts.quantity,
      lineTotal: opts.unitPrice * opts.quantity,
      image: null,
    },
  });
}

describe("a shopper reading an order that is not theirs", () => {
  beforeEach(resetDatabase);

  it("answers 404 for another customer's order number, not 403", async () => {
    // The order number is the key in the shopper's own URL, it is printed on the page, and it is
    // guessable. So the answer must be indistinguishable from an order number nobody ever placed: a
    // 403 says "that order exists and is not yours", which is a fact about someone else's order
    // handed to the person asking.
    const { b, auth, asA, asB } = await twoCustomers();
    const theirs = await makeOrder({ total: 500_000 });

    await expect(shopper(auth).orderByNumber(asA, theirs.orderNumber)).rejects.toMatchObject({
      status: 404,
    });

    // Their own is readable, so the refusal above is about the customer and not about the route.
    const own = await makeOrder({ customerId: b.id, total: 1 });
    const detail = await shopper(auth).orderByNumber(asB, own.orderNumber);
    expect(detail.orderNumber).toBe(own.orderNumber);
  });

  it("answers 404 for another customer's order id", async () => {
    const { auth, asA } = await twoCustomers();
    const theirs = await makeOrder({ total: 500_000 });

    await expect(ordersController(auth).oneOfMine(asA, theirs.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("leaves another customer's order out of the list rather than filtering it after the fact", async () => {
    const { a, auth, asA } = await twoCustomers();
    await makeOrder({ total: 10 });
    await makeOrder({ customerId: a.id, total: 20 });

    const list = await ordersController(auth).mine(asA, {} as never);

    expect(list.orders).toHaveLength(1);
    expect(list.total).toBe(1);
  });

  it("refuses a payment window on another customer's order, and answers no amount", async () => {
    // The window is the one read that hands back a number the caller goes on to charge, so a refusal
    // that leaked the order's total would hand it to whoever guessed the id.
    const { auth, asA } = await twoCustomers();
    const theirs = await makeOrder({ total: 500_000 });
    await db().order.update({
      where: { id: theirs.id },
      data: { paymentStatus: PaymentStatus.AWAITING },
    });

    await expect(shopper(auth).openPaymentWindow(asA, theirs.id)).rejects.toMatchObject({ status: 404 });
  });

  it("leaves another customer's order without the caller's authority written on it", async () => {
    const { auth, asA } = await twoCustomers();
    const theirs = await makeOrder({ total: 500_000 });

    await expect(shopper(auth).recordAuthority(asA, theirs.id, { authority: "A0000001" })).rejects.toMatchObject({
      status: 404,
    });
    expect((await db().order.findUniqueOrThrow({ where: { id: theirs.id } })).gatewayAuthority).toBeNull();
  });

  it("needs a session on every route that touches an order", async () => {
    const { auth, anonymous } = await twoCustomers();
    const theirs = await makeOrder({ total: 500_000 });
    const routes = shopper(auth);

    await expect(routes.orderByNumber(anonymous, theirs.orderNumber)).rejects.toMatchObject({ status: 401 });
    await expect(routes.openPaymentWindow(anonymous, theirs.id)).rejects.toMatchObject({ status: 401 });
    await expect(routes.recordAuthority(anonymous, theirs.id, { authority: "A1" })).rejects.toMatchObject({ status: 401 });
    await expect(routes.readPaymentWindow(anonymous, theirs.id)).rejects.toMatchObject({ status: 401 });
  });
});

describe("a shopper reading their own order", () => {
  beforeEach(resetDatabase);

  // The storefront's order page used to carry four local maps — fulfilment statuses, payment
  // statuses, payment methods and the sentences an event reads as — over enums it imported from
  // nowhere. Two of the statuses it named are not in the schema and three that are went unmentioned,
  // so an order in PROCESSING rendered a history that said nothing at all. The gateway resolving
  // them is the fix, and this is what holds it in place.
  it("answers with the labels, the money and the history already resolved", async () => {
    const { a, auth, asA } = await twoCustomers();
    const order = await makeOrder({ customerId: a.id, total: 1_200_000 });
    await db().order.update({
      where: { id: order.id },
      data: {
        subtotal: 1_500_000,
        discountAmount: 300_000,
        deliveryFee: 0,
        paymentMethod: $Enums.PaymentMethod.CARD_TO_CARD,
        fulfillmentStatus: $Enums.FulfillmentStatus.PROCESSING,
        paymentStatus: PaymentStatus.AWAITING,
      },
    });
    await addLine(order.id, { unitPrice: 1_000_000, quantity: 1 });
    await db().orderStatusEvent.create({
      data: {
        orderId: order.id,
        dimension: "FULFILLMENT",
        from: "CONFIRMED",
        to: "PROCESSING",
        actor: "SYSTEM",
      },
    });

    const detail = await shopper(auth).orderByNumber(asA, order.orderNumber);

    expect(detail.paymentMethodLabel).toBe("کارت به کارت");
    expect(detail.fulfillmentLabel).toBe("در حال پردازش");
    expect(detail.paymentLabel).toBe("در انتظار پرداخت");
    // The delivery fee is nothing, and the page says so rather than printing a formatted zero.
    expect(detail.deliveryFeeLabel).toBe("رایگان");
    // The three parts cross beside the total, because the page prints how the total was reached.
    expect(detail.subtotalFormatted).not.toBe(detail.totalFormatted);
    expect(detail.items[0]?.lineTotalFormatted).toBeTruthy();
    expect(detail.events[0]?.label).toBe("سفارش در حال پردازش شد");
    // A `Json` snapshot narrowed on this side, which is what lets the page print an address without
    // asserting a shape for a column it cannot check.
    expect(detail.shippingAddress.province).toBe("تهران");
  });
});

describe("a shopper opening a payment window", () => {
  beforeEach(resetDatabase);

  it("answers the amount in the unit the provider charges in, formed once", async () => {
    // The conversion used to be applied on the way out by the storefront's payment route and again
    // on the way back by its callback, which is how a boundary ends up charging one figure and
    // verifying another. The gateway forms it, so the two cannot disagree.
    const { a, auth, asA } = await twoCustomers();
    const order = await makeOrder({ customerId: a.id, total: 1_234_567 });

    const window = await shopper(auth).openPaymentWindow(asA, order.id);

    expect(window.amountRial).toBe(12_345_670);
    expect(window.orderNumber).toBe(order.orderNumber);
  });

  it("takes the window's length from the shop's own setting", async () => {
    const { a, auth, asA } = await twoCustomers();
    const order = await makeOrder({ customerId: a.id, total: 100_000 });
    await db().setting.create({ data: { key: "checkout.onlineReserveMinutes", value: 5 } });

    const before = Date.now();
    const window = await shopper(auth).openPaymentWindow(asA, order.id);

    const minutesOut = (new Date(window.expiresAt).getTime() - before) / 60_000;
    expect(minutesOut).toBeGreaterThan(4.9);
    expect(minutesOut).toBeLessThan(5.1);
    // And the order records it, so the window a shopper is shown is the order's own.
    const stored = await db().order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.paymentExpiresAt).not.toBeNull();
  });

  it("refuses a window on an order that is not awaiting payment", async () => {
    const { a, auth, asA } = await twoCustomers();
    const order = await makeOrder({ customerId: a.id, total: 100_000 });
    await db().order.update({ where: { id: order.id }, data: { paymentStatus: PaymentStatus.PAID } });

    await expect(shopper(auth).openPaymentWindow(asA, order.id)).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a window on an order that is not paid for online", async () => {
    // Cash on delivery has no provider to send a shopper to, and a window that opened for one would
    // answer with a payable amount for an order that must not be paid.
    const { a, auth, asA } = await twoCustomers();
    const order = await makeOrder({ customerId: a.id, total: 100_000 });
    await db().order.update({
      where: { id: order.id },
      data: { paymentMethod: $Enums.PaymentMethod.COD },
    });

    await expect(shopper(auth).openPaymentWindow(asA, order.id)).rejects.toMatchObject({ status: 404 });
  });

  it("records the provider's reference against the caller's own order", async () => {
    const { a, auth, asA } = await twoCustomers();
    const order = await makeOrder({ customerId: a.id, total: 100_000 });

    await shopper(auth).recordAuthority(asA, order.id, { authority: "A000000000000000000000001" });

    const status = await shopper(auth).readPaymentWindow(asA, order.id);
    expect(status.authority).toBe("A000000000000000000000001");
    expect(status.paymentLabel).toBe("در انتظار پرداخت");
  });
});

// The decorators on the DTO run in the global validation pipe and nowhere else, so this drives the
// pipe the gateway is built with rather than calling the controller — the same seam, and the same
// options object, as `dto-contract.test.ts` uses.
describe("the authority the gateway accepts", () => {
  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
  const asBody = { type: "body" as const, data: "" };

  it("accepts a reference and refuses a blank one", async () => {
    const accepted = { ...asBody, metatype: PaymentAuthorityDto } as ArgumentMetadata;
    await expect(pipe.transform({ authority: "A0001" }, accepted)).resolves.toBeTruthy();
    await expect(pipe.transform({ authority: "" }, accepted)).rejects.toThrow();
    await expect(pipe.transform({}, accepted)).rejects.toThrow();
  });

  it("refuses a field the DTO does not declare", async () => {
    const accepted = { ...asBody, metatype: PaymentAuthorityDto } as ArgumentMetadata;
    await expect(
      pipe.transform({ authority: "A0001", orderId: "someone-elses" }, accepted),
    ).rejects.toThrow();
  });
});

describe("settling a payment through the route", () => {
  beforeEach(resetDatabase);

  // The ticket's duplicate-callback criterion, at the boundary rather than under the service: two
  // callbacks for one authority, both signed in as the shopper they belong to, arriving together.
  it("settles once when the same callback is delivered twice", async () => {
    const { a, auth, asA } = await twoCustomers();
    const order = await makeOrder({ customerId: a.id, total: 100_000 });
    const variant = await makeVariant({ stock: 10 });
    await reserveStock(order.id, [{ variantId: variant.id, qty: 2 }], $Enums.PaymentMethod.ONLINE);

    const [first, second] = await Promise.all([
      ordersController(auth).settle(asA, order.id, { outcome: "PAID", refId: "REF-9" }),
      ordersController(auth).settle(asA, order.id, { outcome: "PAID", refId: "REF-9" }),
    ]);

    expect([first.kind, second.kind].sort()).toEqual(["already", "settled"]);
    // Committed once, not twice: a double commit is what drove reserved stock negative.
    expect(await readVariant(variant.id)).toEqual({ stock: 8, reserved: 0 });
    const reservations = await db().stockReservation.findMany({ where: { orderId: order.id } });
    expect(reservations.map((r) => r.status)).toEqual([ReservationStatus.COMMITTED]);
    expect(await db().orderStatusEvent.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("refuses to settle somebody else's order, and settles nothing", async () => {
    const { auth, asA } = await twoCustomers();
    const theirs = await makeOrder({ total: 100_000 });
    const variant = await makeVariant({ stock: 10 });
    await reserveStock(theirs.id, [{ variantId: variant.id, qty: 2 }], $Enums.PaymentMethod.ONLINE);

    await expect(ordersController(auth).settle(asA, theirs.id, { outcome: "PAID" })).rejects.toMatchObject({
      status: 404,
    });

    const stored = await db().order.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(stored.paymentStatus).toBe(PaymentStatus.AWAITING);
    // The hold is still held: a refused settlement must not have released or committed it.
    expect(await readVariant(variant.id)).toEqual({ stock: 10, reserved: 2 });
  });
});

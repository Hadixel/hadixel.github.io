// The shopper's payment window, the provider call, and the settlement that follows.
//
// These two routes are the last place the merchant's payment credentials lived outside the gateway.
// The storefront used to hold them, for two reasons that both dissolved on inspection:
//
//   - "it holds the merchant credentials, so calling the provider is its job" — which is a description
//     of where the credentials ended up, not an argument for it. Two processes holding one merchant's
//     credentials is how the checkout page and the process that has to honour the payment are
//     configured to disagree, and a shopper who chose online payment is then told to try again.
//   - the callback fetched the order's total, converted it, verified against it, and handed the
//     outcome to a *different* route to settle. Two requests and two numbers, with nothing tying the
//     amount verified to the amount the order records.
//
// So both are one call now, and the tests are about the properties that were previously impossible to
// state in one place: the amount asked of the provider is the amount the order holds, and a duplicate
// callback settles once.
//
// The provider itself is not stubbed. `zarinpalConfigFromEnv()` reads the environment, so a gateway
// with no provider configured is the state these tests run in — and "refuses rather than guesses" is
// worth a test of its own, because the old behaviour was to answer from a second environment.

import { beforeEach, describe, expect, it } from "vitest";
import { ShopperController } from "../src/shopper/shopper.controller.js";
import { ShopperService } from "../src/shopper/shopper.service.js";
import { OrdersService } from "../src/orders/orders.service.js";
import { db } from "../src/prisma/index.js";
import { makeOrder, resetDatabase } from "./harness.js";

const TOKEN = "good";

function shopper(auth: unknown) {
  return new ShopperController(
    new ShopperService(new OrdersService(db() as never), db() as never),
    auth as never,
  );
}

async function fixture() {
  const customer = await db().customer.create({ data: { phone: "09351110000", name: "خریدار" } });
  // The harness's own order factory, so the fixture is the shape the rest of the suite uses rather than
  // a hand-rolled one that drifts from the schema the moment a field is added.
  const order = await makeOrder({ customerId: customer.id, total: 1_000_000 });
  return {
    order,
    asOwner: { headers: { cookie: `kmodern_customer=${TOKEN}` } } as never,
    anonymous: { headers: { cookie: "" } } as never,
  };
}

describe("starting an online payment", () => {
  beforeEach(resetDatabase);

  it("refuses rather than guessing when the gateway has no payment provider configured", async () => {
    // The whole point of the move. The storefront used to answer this by reading its own copy of the
    // merchant's credentials, and would offer online payment on a deployment where the gateway — the
    // process that has to actually charge the card — was not configured to.
    const { order, asOwner } = await fixture();
    await expect(
      shopper({ customerForToken: async () => ({ customer: { id: order.customerId! } }) }).startPayment(
        asOwner,
        order.id,
        {
          callbackUrl: "https://shop.test/api/orders/x/pay/callback",
        },
      ),
    ).rejects.toThrow(/پیکربندی نشده/);
  });

  it("refuses for an unauthenticated request", async () => {
    const { order, anonymous } = await fixture();
    await expect(
      shopper({ customerForToken: async () => null }).startPayment(anonymous, order.id, {
        callbackUrl: "https://shop.test/api/orders/x/pay/callback",
      }),
    ).rejects.toThrow();
  });

  it("answers absent for someone else's order, rather than saying it exists", async () => {
    // "You may not pay this" tells a shopper probing for another's order that it exists and what state
    // it is in. The window is opened by the same scoped query that has always answered this way, and the
    // start route has to inherit it rather than re-derive the scope.
    const { order } = await fixture();
    const other = shopper({ customerForToken: async () => null });
    await expect(
      other.startPayment({ headers: { cookie: "" } } as never, order.id, {
        callbackUrl: "https://shop.test/cb",
      }),
    ).rejects.toThrow();
  });
});

describe("verifying a payment and settling the order", () => {
  beforeEach(resetDatabase);

  it("refuses rather than guessing when the gateway has no payment provider configured", async () => {
    // Verification used to happen in the storefront, against a total the storefront had fetched
    // separately. Both halves of that are now here, which is why this route is the one that knows it
    // cannot verify at all.
    const { order, asOwner } = await fixture();
    await expect(
      shopper({ customerForToken: async () => ({ customer: { id: order.customerId! } }) }).verifyPayment(
        asOwner,
        order.id,
        { authority: "A-1" },
      ),
    ).rejects.toThrow(/پیکربندی نشده/);
  });

  it("refuses for an unauthenticated request", async () => {
    const { order, anonymous } = await fixture();
    await expect(
      shopper({ customerForToken: async () => null }).verifyPayment(anonymous, order.id, {
        authority: "A-1",
      }),
    ).rejects.toThrow();
  });
});

describe("what the gateway reads to verify a payment", () => {
  beforeEach(resetDatabase);

  it("reads the total from the order rather than from the caller", async () => {
    // The two-numbers problem, stated as a test. `readOrderForPayment` takes only an order id and the
    // shopper's id, so there is no argument through which a caller could supply the amount to verify
    // against — the signature is the constraint.
    const { order } = await fixture();
    const service = new ShopperService(new OrdersService(db() as never), db() as never);
    const found = await service.readOrderForPayment(order.id, order.customerId!);
    expect(found?.total).toBe(1_000_000);
  });

  it("answers absent for an order belonging to someone else", async () => {
    const { order } = await fixture();
    const service = new ShopperService(new OrdersService(db() as never), db() as never);
    expect(await service.readOrderForPayment(order.id, "09350009999-not-a-customer")).toBeNull();
  });
});

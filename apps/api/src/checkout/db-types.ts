// The narrow slice of the data client the checkout rules actually use.
//
// Each rule is handed whatever client the caller has: the pooled client for a quote, or a
// transaction's client when the rule is part of placing an order. Typing them against the full client
// would force every one of them to open its own transaction, and a quote that reads the shipping
// setting from a different connection than the order it is about to freeze is a quote that can disagree
// with the order.
//
// A transaction client is the full client minus the lifecycle methods, so naming the delegates rather
// than the client is what lets both be passed to the same function.

import type { createPrismaClient } from "../prisma/index.js";

type Db = ReturnType<typeof createPrismaClient>;

export type CheckoutDb = Pick<
  Db,
  "discount" | "order" | "orderItem" | "orderNumberCounter" | "orderStatusEvent" | "product" | "setting" | "variant"
>;

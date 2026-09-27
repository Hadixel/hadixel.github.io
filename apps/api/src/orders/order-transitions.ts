// Fulfilment and payment transitions, defined once.
//
// These tables used to exist twice inside the admin: once in the server action that enforces them and
// once in the component that offers them. The two were byte-identical copies on opposite sides of the
// network boundary, so the UI's idea of what an operator may do was kept in step by hand, and the only
// thing that caught a drift was an operator clicking a button the server then refused.
//
// They are here because the gateway is what enforces them, and the panel asks the gateway what it
// accepts rather than carrying its own opinion. A new status therefore lands in one place, and the
// form cannot offer a transition the server would reject.
//
// Terminal states map to an empty list, which is what the UI reads as "nothing further is possible".

export const FULFILLMENT_NEXT: Record<string, readonly string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  CANCELLED: [],
  RETURNED: [],
};

export const PAYMENT_NEXT: Record<string, readonly string[]> = {
  AWAITING: ["PAID", "FAILED"],
  PAID: ["REFUNDED"],
  FAILED: ["AWAITING"],
  REFUNDED: [],
};

export const TRANSITIONS = {
  FULFILLMENT: FULFILLMENT_NEXT,
  PAYMENT: PAYMENT_NEXT,
} as const;

export type TransitionDimension = keyof typeof TRANSITIONS;

/** What an operator may do to an order in this state, or nothing if it is terminal. */
export function allowedTransitions(
  dimension: TransitionDimension,
  from: string,
): readonly string[] {
  return TRANSITIONS[dimension][from] ?? [];
}

export function isAllowedTransition(
  dimension: TransitionDimension,
  from: string,
  to: string,
): boolean {
  return allowedTransitions(dimension, from).includes(to);
}

/**
 * The states that move stock, and which way.
 *
 * A transition's side effect is a property of the transition, not of the caller that applies it, so it
 * is looked up here rather than re-derived per call site — that duplication is how one side ended up
 * committing and the other releasing for the same move.
 */
export const STOCK_EFFECT = {
  PAID: "commit",
  FAILED: "release",
  REFUNDED: "restock",
  CANCELLED: "release-unless-paid",
  RETURNED: "release-unless-paid",
} as const;

export type StockEffect = (typeof STOCK_EFFECT)[keyof typeof STOCK_EFFECT];

export function stockEffectFor(
  dimension: TransitionDimension,
  to: string,
  paymentStatus: string,
): StockEffect | null {
  if (dimension === "PAYMENT") {
    return STOCK_EFFECT[to as keyof typeof STOCK_EFFECT] ?? null;
  }
  if (to === "CANCELLED" || to === "RETURNED") {
    // A cancellation of an order that was already paid puts the sold units back; one that was still
    // awaiting payment simply drops the hold. Both are the same decision from two directions.
    return paymentStatus === "PAID" ? "restock" : "release";
  }
  return null;
}

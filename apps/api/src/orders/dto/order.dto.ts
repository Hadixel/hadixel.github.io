// The order read model, as the gateway returns it.
//
// A client renders an order; it does not query one. So what crosses the wire is a shape built for
// display — labels resolved, totals already converted — rather than the row, because the row is the
// gateway's business and the fact that it is a `Float` in TOMAN is not something a client should have
// to know to add up a basket.

export interface OrderSummary {
  id: string;
  orderNumber: string;
  /** Persian, ready to render. Resolved here so no client re-derives a status label. */
  fulfillmentLabel: string;
  paymentLabel: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  total: number;
  totalFormatted: string;
  placedAt: string;
  itemCount: number;
}

export interface OrderLine {
  productName: string;
  colorName: string | null;
  sku: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  lineTotalFormatted: string;
  image: string | null;
}

export interface OrderEvent {
  dimension: string;
  from: string;
  to: string;
  actor: string;
  note: string | null;
  at: string;
}

export interface OrderDetail extends OrderSummary {
  items: OrderLine[];
  events: OrderEvent[];
  /** The transitions the server will accept from here — so a client never offers one it will refuse. */
  transitions: { fulfillment: string[]; payment: string[] };
  shippingAddress: unknown;
}

/**
 * What a settlement did, for the caller to act on.
 *
 * `already` is deliberately not an error: a payment gateway redirecting a shopper back twice is
 * ordinary, and answering it with a failure would tell a customer their payment failed when it
 * succeeded. `conflict` is the opposite — the order moved somewhere this settlement must not touch —
 * and the caller surfaces that rather than retrying.
 */
export type SettlementResponse =
  | { kind: "settled"; paymentStatus: string }
  | { kind: "already"; paymentStatus: string }
  | { kind: "conflict"; paymentStatus: string }
  | { kind: "hold-lost" };

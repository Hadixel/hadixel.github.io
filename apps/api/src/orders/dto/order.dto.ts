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
  /**
   * Persian, resolved: a shopper's history reads as sentences.
   *
   * The storefront rendered this from a local table over the same two dimensions, which is how an
   * order's history came to name a fulfilment status the schema does not have while staying silent
   * about three it does.
   */
  label: string;
  at: string;
}

export interface OrderDetail extends OrderSummary {
  items: OrderLine[];
  events: OrderEvent[];
  /** The transitions the server will accept from here — so a client never offers one it will refuse. */
  transitions: { fulfillment: string[]; payment: string[] };
  /** How it is being paid for, and that method's name. */
  paymentMethod: string;
  paymentMethodLabel: string;
  /**
   * How the total was reached, and each part of it already formatted.
   *
   * The order's total was frozen in TOMAN when it was placed, so a client adding the parts up itself
   * is a client that can disagree with the invoice. The numbers cross beside the sentences because a
   * client may need to compare rather than to print — the panel prices a refund off them.
   */
  subtotal: number;
  subtotalFormatted: string;
  discountAmount: number;
  discountAmountFormatted: string;
  deliveryFee: number;
  /**
   * The fee as a shopper reads it: "رایگان" when there is none, because a formatted zero on a
   * delivery row is a fact about the number rather than about the delivery.
   */
  deliveryFeeLabel: string;
  shippingAddress: OrderShippingAddress;
}

// ---- the operator's views ----
//
// A shopper's order and an operator's order are the same order and not the same read. The operator
// decides what happens to this one next, so their list carries the customer and their detail carries
// the stock holds and the gateway's own references behind it. Widening `OrderSummary` — which every
// list row in both apps is built from — would hand all of that to every order table in the shop, so
// the operator's rows extend the detail instead.

/** One row of the operator's order table. */
export interface OrderAdminSummary extends OrderSummary {
  paymentMethod: string;
  /**
   * The customer, nested.
   *
   * Nested because the table's cell reads a name and falls back to a phone off the same object, and
   * a read that answered a different shape is a translation the panel has to write.
   */
  customer: { id: string; name: string | null; phone: string };
}

export interface OrderAdminListResponse {
  orders: OrderAdminSummary[];
  total: number;
}

/** One stock hold behind an order. */
export interface OrderReservation {
  id: string;
  qty: number;
  status: string;
  expiresAt: string;
}

/**
 * The address as it was when the order was placed.
 *
 * Typed rather than `unknown`, and narrowed here rather than cast in the client. It is a `Json`
 * snapshot, so it can genuinely be anything — the page used to assert it was a `Record<string,
 * string>` and read five keys off it, which is a rule about a column the client cannot check. Each
 * field is a string or nothing, and a snapshot missing one renders as a missing line.
 */
export interface OrderShippingAddress {
  province: string | null;
  city: string | null;
  addressLine: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  postalCode: string | null;
}

/**
 * One order for an operator, in full.
 *
 * `transitions`, the amounts the total is made of and the address are inherited rather than
 * re-declared: they are one order's facts, and an operator's page and a shopper's page are two
 * renderings of the same row. What is added here is what only an operator may see — who the customer
 * is, the stock holds behind the order, and the gateway's own references for it.
 */
export interface OrderAdminDetail extends OrderDetail {
  customerId: string;
  customer: { id: string; name: string | null; phone: string; email: string | null };
  shippingMethod: string;
  deliveryFeeMode: string;
  gatewayRefId: string | null;
  shippingTracking: string | null;
  adminNote: string | null;
  reservations: OrderReservation[];
  shippingAddress: OrderShippingAddress;
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

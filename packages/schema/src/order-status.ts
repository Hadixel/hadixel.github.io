// Persian labels for the order's two status dimensions.
//
// These used to live in the admin panel's badge component, which meant the gateway could not put a
// label on a status it returned and every client would have grown its own copy. They are domain
// vocabulary rather than presentation, so they live beside the rest of the domain vocabulary and both
// clients and the gateway read the same map.
//
// The enums are the source of truth for *which* statuses exist; these are only their names. A status
// added to the schema without a label here renders as its own name rather than as a blank, which is
// the failure mode worth having.

export const FULFILLMENT_LABELS: Record<string, string> = {
  PENDING: "در انتظار",
  CONFIRMED: "تأیید شده",
  PROCESSING: "در حال پردازش",
  SHIPPED: "ارسال شده",
  DELIVERED: "تحویل شده",
  CANCELLED: "لغو شده",
  RETURNED: "مرجوعی",
};

export const PAYMENT_LABELS: Record<string, string> = {
  AWAITING: "در انتظار پرداخت",
  PAID: "پرداخت شده",
  REFUNDED: "استرداد شده",
  FAILED: "ناموفق",
};

export function fulfillmentLabel(status: string): string {
  return FULFILLMENT_LABELS[status] ?? status;
}

export function paymentLabel(status: string): string {
  return PAYMENT_LABELS[status] ?? status;
}

/**
 * How the order was paid for.
 *
 * Beside the two maps above and for the same reason: the storefront's order page carried a fourth
 * copy of this vocabulary next to its own three, so a payment method added to the schema rendered as
 * its own name there while the gateway called it something else.
 */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  ONLINE: "پرداخت آنلاین",
  CARD_TO_CARD: "کارت به کارت",
  COD: "پرداخت هنگام تحویل",
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

/**
 * What a status event reads as in an order's history, keyed `dimension:status`.
 *
 * Separate from the two maps above because an event is a sentence about a change and a status is a
 * state: `PAID` on its own is "پرداخت شده", and the same status as an event on a shopper's order is
 * "پرداخت تأیید شد". The storefront's order page held this table as a local `Record` over the same
 * two dimensions and it had drifted — it named a fulfilment `PACKED` and a payment `CANCELLED`,
 * neither of which is in the schema, and was missing `PROCESSING`, `RETURNED` and `REFUNDED`, which
 * are. Those three rendered as the order's history saying nothing at all.
 *
 * So the keys are the schema's statuses, and a status with no sentence falls back to the neutral one
 * rather than to a blank line: a status added to the schema without a sentence here appears as an
 * event that says it changed, which is the failure mode worth having.
 */
const ORDER_EVENT_LABELS: Record<string, string> = {
  "FULFILLMENT:PENDING": "سفارش در انتظار تأیید",
  "FULFILLMENT:CONFIRMED": "سفارش تأیید شد",
  "FULFILLMENT:PROCESSING": "سفارش در حال پردازش شد",
  "FULFILLMENT:SHIPPED": "سفارش ارسال شد",
  "FULFILLMENT:DELIVERED": "سفارش تحویل شد",
  "FULFILLMENT:CANCELLED": "سفارش لغو شد",
  "FULFILLMENT:RETURNED": "سفارش مرجوع شد",
  "PAYMENT:AWAITING": "پرداخت در انتظار تأیید",
  "PAYMENT:PAID": "پرداخت تأیید شد",
  "PAYMENT:FAILED": "پرداخت ناموفق بود",
  "PAYMENT:REFUNDED": "مبلغ سفارش مسترد شد",
};

export function orderEventLabel(dimension: string, status: string): string {
  return ORDER_EVENT_LABELS[`${dimension}:${status}`] ?? "وضعیت سفارش تغییر کرد";
}

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

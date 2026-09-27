// The order status change, as a thin module over the gateway.
//
// This file used to be 60 lines of the panel's own: two transition tables, a transaction, the stock
// side effects, an audit write, and six error messages for failures the gateway already describes. The
// gateway has had the rules since ticket 08 — `POST /orders/:id/status` and `GET /orders/:id/transitions`
// — and the panel's copies were free to disagree with them, which is what they had: the panel's
// `setOrderStatus` validated against its own table and then wrote the change itself, so the server
// checked the transition a second time against a table that was byte-identical but separately edited.
//
// So both copies of the table are gone from the panel. The form is rendered from what the gateway says
// is allowed, and the write is the gateway's. What is left here is the translation: form fields to a
// request, and the gateway's answer to a result the form can render. The rule is not reimplemented
// here, and that is the point — a rule that exists in one place cannot drift from itself.
//
// `adminUserId` is passed rather than read from the session. The gateway takes the operator's identity
// from the cookie it was sent, and the audit line it writes names the operator from that; the id here
// exists only so the panel's own audit call, if a caller needs one, has it.

import { fromGateway } from "@/lib/gateway";
import { failed, type ActionResult } from "./result";

/** What the gateway accepts for a status change. Mirrors the gateway's StatusChangeDto. */
export interface StatusChangeInput {
  orderId: string;
  dimension: "FULFILLMENT" | "PAYMENT";
  to: string;
  note?: string;
}

/** The transitions the gateway will accept for an order, as the form must render them. */
export interface OrderTransitions {
  fulfillment: string[];
  payment: string[];
}

const DIMENSIONS = new Set(["FULFILLMENT", "PAYMENT"]);

/**
 * Apply a status change through the gateway.
 *
 * The form fields are validated here only for shape — a `dimension` that is not one of the two, a note
 * past the length the gateway accepts. Whether the *transition* is legal is not decided here, because
 * the table is the gateway's and a second copy of it is the defect this file exists to remove. A
 * refusal comes back with the gateway's own Persian sentence.
 */
export async function setOrderStatus(input: StatusChangeInput): Promise<ActionResult> {
  if (!input.orderId) return failed("درخواست تغییر وضعیت نامعتبر است");
  if (!DIMENSIONS.has(input.dimension)) return failed("درخواست تغییر وضعیت نامعتبر است");
  if (!input.to) return failed("درخواست تغییر وضعیت نامعتبر است");
  // Bounded to the same length the gateway's DTO allows, so an over-long note is refused here with a
  // sentence rather than arriving as a validation envelope the operator has to decode.
  if ((input.note?.length ?? 0) > 1000) return failed("توضیح بیش از حد طولانی است");

  return fromGateway(
    (client) => client.post(`/orders/${encodeURIComponent(input.orderId)}/status`, {
      dimension: input.dimension,
      to: input.to,
      ...(input.note ? { note: input.note } : {}),
    }),
    "وضعیت سفارش به‌روزرسانی شد",
  );
}

/**
 * The transitions the gateway will accept, for an order the form is about to render.
 *
 * Served rather than tabulated, which is the whole of what the two byte-identical tables in the panel
 * used to be for. An order that is gone answers null, and the form treats that as "nothing to offer"
 * rather than as an error — the page that called this has already established the order exists.
 */
export async function readOrderTransitions(orderId: string): Promise<OrderTransitions | null> {
  return fromGateway<OrderTransitions | null>(
    (client) => client.get<OrderTransitions | null>(`/orders/${encodeURIComponent(orderId)}/transitions`),
    "",
  ).then((result) => (result.ok ? (result.data ?? null) : null));
}

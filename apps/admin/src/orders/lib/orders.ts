"use server";

import { redirect } from "next/navigation";
import { addressSchema, normalizeCityName } from "@kmodern/contracts";
import { actionContext } from "@/lib/actions/ctx";
import { field, jsonParse } from "@/lib/actions/form-helpers";
import { setOrderStatus } from "@/orders/lib/order-status";
import { fromGateway } from "@/lib/gateway";
import { failed, type ActionResult } from "@/lib/actions/result";

/**
 * Order status change, through the gateway.
 *
 * A form-fields-to-request adapter and nothing more. The transition tables, the compare-and-set, the
 * stock side effect, the event and the audit line all belong to the gateway, which has enforced them
 * since ticket 08 — the panel's copies of that logic were a second implementation free to disagree,
 * and one of them had already: the panel released stock on a cancellation unconditionally where the
 * gateway restocks a paid order. The `actionContext()` call remains so an unauthenticated POST to this
 * action is refused at the panel's own boundary before the gateway is asked on the operator's behalf.
 */
export async function setOrderStatusAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await actionContext();
  return setOrderStatus({
    orderId: field(formData, "orderId"),
    dimension: field(formData, "dimension") as "FULFILLMENT" | "PAYMENT",
    to: field(formData, "to"),
    note: field(formData, "note") || undefined,
  });
}

interface ManualItemInput {
  variantId: string;
  qty: number;
}

/**
 * Place a manual order, through the gateway.
 *
 * This used to be a transaction in the panel: it allocated the order number, priced the lines,
 * reserved the stock, wrote the status events and the audit line, and committed — in a second copy of
 * rules the gateway already held. The order number in particular came from a second counter
 * implementation, so the panel and the checkout were two implementations of "the next order number",
 * free to hand the same number to two different orders.
 *
 * What is left here is the part that cannot move: reading eleven dot-named fields out of a form and
 * turning them into a request. The bounds — a hundred lines, a thousand of a variant, a duplicate
 * variant, the note's length — are the gateway's `ManualOrderDto` now, which means a caller that
 * skipped this action is held to the same rules rather than none.
 */
export async function createManualOrder(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await actionContext();
  const customerId = field(formData, "customerId");
  const paymentMethod = field(formData, "paymentMethod");
  const shippingMethod = field(formData, "shippingMethod");
  const deliveryFeeMode = field(formData, "deliveryFeeMode");
  const rawDeliveryFee = Number(formData.get("deliveryFee") ?? 0);
  const adminNote = field(formData, "adminNote") || null;
  const items = jsonParse<ManualItemInput[]>(formData.get("items") as string | null, []);

  // The manual-order form posts dot-named address fields (no hidden JSON blob), so the shape is
  // assembled here. Parsing it is the schema package's job and stays there — and so is the one
  // normalisation the schema cannot do for us: `normalizeCityName` is the kernel's, and a city is
  // persisted here, so this is where "خواجه نصير   ابالله" stops being two spellings of one place.
  const address = {
    recipientName: field(formData, "recipientName"),
    recipientPhone: field(formData, "recipientPhone"),
    province: field(formData, "province"),
    city: normalizeCityName(field(formData, "city")),
    line1: field(formData, "line1"),
    line2: field(formData, "line2"),
    postalCode: field(formData, "postalCode"),
    landmark: field(formData, "landmark"),
  } as const;
  const addressParsed = addressSchema.safeParse({ ...address, isDefault: false });
  if (!addressParsed.success) {
    return failed(addressParsed.error.issues[0]?.message ?? "آدرس گیرنده معتبر نیست");
  }

  if (!customerId) return failed("مشتری را انتخاب کنید");

  const result = await fromGateway(
    (client) =>
      client.post<{ id: string; orderNumber: string }>("/orders/manual", {
        customerId,
        address: addressParsed.data,
        paymentMethod,
        shippingMethod,
        deliveryFeeMode,
        // A quoted fee of zero is a real value, so it is passed through rather than dropped: the form
        // sends "0" for free delivery and the gateway decides what FREE means.
        deliveryFee: Number.isFinite(rawDeliveryFee) ? rawDeliveryFee : 0,
        adminNote,
        lines: items.map((item) => ({ variantId: item?.variantId, qty: item?.qty })),
      }),
    "سفارش دستی ثبت شد.",
  );

  if (!result.ok) return result;
  // `data` is optional on a success because not every action has something to return; this one does,
  // and a redirect built from `undefined` would send the operator to a page that is not an order.
  if (result.data === undefined) return failed("پاسخ درگاه ناقص بود؛ دوباره تلاش کنید");
  redirect(`/orders/${result.data.id}`);
}


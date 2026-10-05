"use server";

import { actionContext } from "@/lib/actions/ctx";
import { field, intField } from "@/lib/actions/form-helpers";
import { fromGateway } from "@/lib/gateway";
import { failed, type ActionResult } from "@/lib/actions/result";

/**
 * Per-variant stock adjustment, through the gateway.
 *
 * It was declared in `src/orders/lib/orders.ts` and imported from there by the inventory page's
 * adjust form, so the inventory feature reached into the orders feature for its own write path —
 * one feature's file owning another feature's behaviour, which §9.4's one-root rule exists to stop.
 * The gateway route it calls is `/inventory/variants/:id/adjust`, which is what settled the home.
 *
 * The compare-and-set, the reserved-stock floor and the audit line are the gateway's — `inventory`
 * has owned the stock lifecycle since ticket 08, and the panel's copy of that logic was a fourth
 * implementation free to disagree. The `note` is sent rather than recorded locally because it is the
 * only part of this action that is the panel's business: what the operator said about the adjustment.
 */
export async function adjustStock(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await actionContext();
  const variantId = field(formData, "variantId");
  const delta = intField(formData, "delta");
  const note = field(formData, "note") || "تعدیل دستی";

  if (!variantId || delta === 0 || Math.abs(delta) > 1_000_000 || note.length > 500) {
    return failed("مقدار تغییر یا توضیح نامعتبر است");
  }

  return fromGateway(
    (client) =>
      client.post(`/inventory/variants/${encodeURIComponent(variantId)}/adjust`, { delta, note }),
    "موجودی تعدیل شد",
  );
}

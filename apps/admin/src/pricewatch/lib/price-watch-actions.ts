"use server";

// The price watch actions, and nothing else.
//
// The adapter for `price-watch.ts`, and it exists for the same reason `settings-actions.ts` does:
// the panel's session check reads the request's cookies, and Next's `cookies()` throws outside a
// request scope — so the check cannot live in the module the form drives. Everything that decides
// anything is in `price-watch.ts`; this adds the check and hands the form over.
//
// The session call is a guard, not a source of the operator's identity. The gateway takes the
// operator from the cookie it is sent and writes the audit line from that, so nothing here decides
// who applied a price — a panel that could would be a panel whose audit line could be forged by a
// form field.

import { actionContext } from "@/lib/actions/ctx";
import type { ActionResult } from "@/lib/actions/result";
import {
  applyPriceChangesRequest,
  ignorePriceChangesRequest,
  runPriceWatchNowRequest,
  savePriceWatchRequest,
  selectedChangeIds,
} from "@/pricewatch/lib/price-watch";

/** Save the schedule. Bound directly by `useActionState`. */
export async function savePriceWatch(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await actionContext();
  return savePriceWatchRequest(formData);
}

/** Check the source now. Bound by the button, so it takes no previous state. */
export async function runPriceWatchNow(): Promise<ActionResult> {
  await actionContext();
  return runPriceWatchNowRequest();
}

/**
 * Apply the changes whose boxes are ticked, or every pending one when none are.
 *
 * The empty case is not a fallback bolted on: "apply everything pending" is a single button, it is
 * the operator's most common action, and expressing it as "tick every box" is a form asking for a
 * decision nobody made. The gateway reads an empty list the same way.
 */
export async function applyPriceChanges(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await actionContext();
  return applyPriceChangesRequest(selectedChangeIds(formData));
}

/** Apply every pending change regardless of what is ticked. */
export async function applyAllPendingPriceChanges(): Promise<ActionResult> {
  await actionContext();
  return applyPriceChangesRequest([]);
}

/** Set the ticked changes aside. */
export async function ignorePriceChanges(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await actionContext();
  return ignorePriceChangesRequest(selectedChangeIds(formData));
}

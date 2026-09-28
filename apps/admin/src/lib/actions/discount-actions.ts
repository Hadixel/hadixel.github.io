"use server";

// The discount actions, and nothing else.
//
// The adapter for `discount.ts`, and it exists for the same reason `category-actions.ts` does: the
// panel's session check reads the request's cookies, and Next's `cookies()` throws outside a request
// scope — so the check cannot live in the module the tests drive. Everything that decides anything is
// in `discount.ts`; this adds the check and hands the form over.

import { actionContext } from "./ctx";
import { saveDiscountRequest, deleteDiscountRequest } from "./discount";
import type { ActionResult } from "./result";

/** Create or edit a discount. Bound directly by `useActionState`. */
export async function saveDiscount(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  // A guard, not a source of the operator's identity: the gateway takes the operator from the cookie
  // it is sent and writes the audit line from that, so nothing here decides who made the change.
  await actionContext();
  return saveDiscountRequest(formData);
}

/** Delete a discount. Bound directly by `useActionState`. */
export async function deleteDiscount(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await actionContext();
  return deleteDiscountRequest(formData);
}

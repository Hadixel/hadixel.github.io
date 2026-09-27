"use server";

// The collection actions, and nothing else.
//
// The adapter for `collection.ts`, and it exists for the same reason `category-actions.ts` does: the
// panel's session check reads the request's cookies, and Next's `cookies()` throws outside a request
// scope — so the check cannot live in the module the tests drive. Everything that decides anything is
// in `collection.ts`; this adds the check and hands the form over.

import { actionContext } from "./ctx";
import { saveCollectionRequest, deleteCollectionRequest } from "./collection";
import type { ActionResult } from "./result";

/** Create or edit a collection. Bound directly by `useActionState`. */
export async function saveCollection(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await actionContext();
  return saveCollectionRequest(formData);
}

/** Delete a collection. Bound directly by `useActionState`. */
export async function deleteCollection(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await actionContext();
  return deleteCollectionRequest(formData);
}

"use server";

// The page actions, and nothing else.
//
// The adapter for `page.ts`, and it exists for the same reason `category-actions.ts` does: the panel's
// session check reads the request's cookies, and Next's `cookies()` throws outside a request scope —
// so the check cannot live in the module the tests drive.
//
// It also owns the one delete action a form binds. There used to be a bare `deletePage(formData)` and
// a `deletePageAction(_prev, formData)` that existed only to satisfy `useActionState` and returned
// whatever the first one did — two names for one rule, and one of them to be forgotten.

import { actionContext } from "@/lib/actions/ctx";
import { savePageRequest, deletePageRequest } from "@/content/lib/page";
import type { ActionResult } from "@/lib/actions/result";

/** Create or edit a page. Bound directly by `useActionState`. */
export async function savePage(
  _prev: ActionResult<{ pageId: string }>,
  formData: FormData,
): Promise<ActionResult<{ pageId: string }>> {
  // A guard, not a source of the operator's identity: the gateway takes the operator from the cookie
  // it is sent and writes the audit line from that.
  await actionContext();
  return savePageRequest(formData);
}

/** Delete a page. Bound directly by `useActionState`. */
export async function deletePage(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await actionContext();
  return deletePageRequest(formData);
}

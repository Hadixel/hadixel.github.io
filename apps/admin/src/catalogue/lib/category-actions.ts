"use server";

// The category tree's two server actions, and nothing else.
//
// This file exists to add one thing to the module next door: the panel's own session check. An
// operator whose cookie has expired should be sent to the login screen by the panel, rather than
// having the gateway answer 401 and the form report it as a failed save. That check reads the request's
// cookies, and Next's `cookies()` throws outside a request scope — which is why it cannot live in
// `category.ts` and why the two are separate files rather than one file with a guard at the top.
//
// Everything that is worth reasoning about — which verb, a blank parent, an empty spec-field list — is
// in `category.ts`, and is tested there. This is the adapter: two functions, each of which checks the
// session and hands the form straight over. Neither can drift from the other because neither decides
// anything.

import { actionContext } from "@/lib/actions/ctx";
import { saveCategoryRequest, deleteCategoryRequest } from "@/catalogue/lib/category";
import type { ActionResult } from "@/lib/actions/result";

/** Create or edit a category. Bound directly by `useActionState`. */
export async function saveCategory(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  // A guard, not a source of the operator's identity: the gateway takes the operator from the cookie it
  // is sent and writes the audit line from that, so nothing here decides who made the change.
  await actionContext();
  return saveCategoryRequest(formData);
}

/** Delete a category. Bound directly by `useActionState`. */
export async function deleteCategory(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await actionContext();
  return deleteCategoryRequest(formData);
}

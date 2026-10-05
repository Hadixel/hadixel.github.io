"use server";

// The navigation action, and nothing else.
//
// The adapter for `nav.ts`, and it exists for the same reason `category-actions.ts` does: the panel's
// session check reads the request's cookies, and Next's `cookies()` throws outside a request scope.

import { actionContext } from "@/lib/actions/ctx";
import { saveNavRequest } from "@/content/lib/nav";
import type { ActionResult } from "@/lib/actions/result";

/** Save one location's tree. Bound directly by `useActionState`. */
export async function saveNav(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  // A guard, not a source of the operator's identity: the gateway takes the operator from the cookie it
  // is sent and writes the audit line from that.
  await actionContext();
  return saveNavRequest(formData);
}

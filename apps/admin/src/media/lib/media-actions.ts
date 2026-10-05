"use server";

// The media actions, and nothing else.
//
// The adapter for `media.ts`, and it exists for the same reason `category-actions.ts` does: the panel's
// session check reads the request's cookies, and Next's `cookies()` throws outside a request scope.

import { actionContext } from "@/lib/actions/ctx";
import { deleteMediaRequest } from "@/media/lib/media";
import type { ActionResult } from "@/lib/actions/result";

/** Delete one file from the library. Bound directly by `useActionState`. */
export async function deleteMedia(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // A guard, not a source of the operator's identity: the gateway takes the operator from the cookie it
  // is sent and writes the audit line from that.
  await actionContext();
  return deleteMediaRequest(formData);
}

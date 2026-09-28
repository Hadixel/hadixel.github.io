"use server";

// The settings actions, and nothing else.
//
// The adapter for `settings.ts`, and it exists for the same reason `category-actions.ts` does: the
// panel's session check reads the request's cookies, and Next's `cookies()` throws outside a request
// scope — so the check cannot live in the module the tests drive. Everything that decides anything is
// in `settings.ts`; this adds the check and hands the form over.

import { actionContext } from "./ctx";
import { saveSettingsRequest } from "./settings";
import type { ActionResult } from "./result";

/** Save the section the operator was editing. Bound directly by `useActionState`. */
export async function saveSettings(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // A guard, not a source of the operator's identity: the gateway takes the operator from the cookie
  // it is sent and writes the audit line from that, so nothing here decides who made the change.
  await actionContext();
  return saveSettingsRequest(formData);
}

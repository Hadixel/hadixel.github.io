"use server";

// The post actions, and nothing else.
//
// The adapter for `post.ts`, and it exists for the same reason `category-actions.ts` does: the panel's
// session check reads the request's cookies, and Next's `cookies()` throws outside a request scope.
//
// It also owns the redirect, because that is the one thing here that is genuinely the panel's: saving a
// post should land the operator back on the post list, and a gateway answer is not a navigation.

import { redirect } from "next/navigation";
import { actionContext } from "@/lib/actions/ctx";
import { savePostRequest, deletePostRequest } from "@/content/lib/post";
import type { ActionResult } from "@/lib/actions/result";

/** Create or edit a post. Bound directly by `useActionState`. */
export async function savePost(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  // A guard, not a source of the operator's identity: the gateway takes the operator from the cookie it
  // is sent and writes the audit line from that.
  await actionContext();
  const result = await savePostRequest(formData);
  // Outside any `try`: `redirect` works by throwing, and a catch around it would swallow the very thing
  // it is asking for.
  if (result.ok) redirect("/blog");
  return result;
}

/** Delete a post. Bound directly by `useActionState`. */
export async function deletePost(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await actionContext();
  return deletePostRequest(formData);
}

"use server";

// The product actions, and nothing else.
//
// The adapter for `product.ts`, and it exists for the same reason `category-actions.ts` does: the
// panel's session check reads the request's cookies, and Next's `cookies()` throws outside a request
// scope — so the check cannot live in the module the tests drive.
//
// It also owns the redirect, which is the one thing here that is genuinely the panel's business and
// not a translation: saving a product should land the operator on that product's page, and a gateway
// answer that names a resource is not a navigation. It lives *after* the result is known to be a
// success, and never inside a `try` — `NEXT_REDIRECT` works by throwing, and the panel's old
// `saveProduct` caught its own errors around the call and would have swallowed it.

import { redirect } from "next/navigation";
import { actionContext } from "@/lib/actions/ctx";
import { saveProductRequest } from "@/catalogue/lib/product";
import type { ActionResult } from "@/lib/actions/result";

/** Create or edit a product. Bound directly by `useActionState`. */
export async function saveProduct(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult> {
  // A guard, not a source of the operator's identity: the gateway takes the operator from the cookie
  // it is sent and writes the audit line from that, so nothing here decides who made the change.
  await actionContext();

  const result = await saveProductRequest(formData);
  if (result.ok && result.data) redirect(`/products/${result.data.productId}`);
  return result.ok ? { ok: true, message: result.message } : result;
}

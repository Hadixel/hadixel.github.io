// Media, as a thin module over the gateway.
//
// The library's one write. The panel's version deleted the file itself and then wrote its audit line
// — and the key rule, `isSafeMediaKey`, was an unexported function in the panel's own media helper, so
// it was enforced by whichever caller remembered it. That rule is a *security* rule: a key that climbs
// out of the media directory, or that names a type the storefront will not serve, is a request to
// reach something the library is not. It is the gateway's now, and the panel's copy is gone.
//
// What is left is one translation: the key, as the library listed it. Nothing else — there is no second
// decision here, and inventing one would be the wrong shape for a delete.

import { field } from "./form-helpers";
import { fromGateway } from "@/lib/gateway";
import { failed, type ActionResult } from "./result";

/**
 * Delete one file from the library.
 *
 * The one implementation of this path, and the last of the eight the panel had doubled: a bare
 * `deleteMedia(formData)` and a `deleteMediaAction(_prev, formData)` that existed only to satisfy
 * `useActionState` and returned whatever the first one did.
 */
export async function deleteMediaRequest(formData: FormData): Promise<ActionResult> {
  const key = field(formData, "key");
  if (!key) return failed("کلید فایل نامعتبر است");

  // The key travels in the path because the transport client's DELETE takes no body, and a key is a
  // path — `media/2026/01/abc.jpg` is one address. Encoded whole, so its own slashes cannot be read
  // as path separators on the way out.
  return fromGateway(
    (client) => client.delete(`/media/${encodeURIComponent(key)}`),
    "فایل حذف شد",
  );
}

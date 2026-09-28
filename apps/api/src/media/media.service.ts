// What a media key may be, and where a local file may be deleted from.
//
// The key rule is a security rule and it belongs here rather than in the panel: a key that can climb
// out of the media directory with `..`, or that names a file type the storefront will not serve, is a
// request to reach something the media library is not. The panel held this as an unexported
// `isSafeMediaKey`, so it was enforced only by the one caller that remembered it — and the media
// *list* filtered by it while nothing else did.

import { promises as fs } from "node:fs";
import path from "node:path";
import { MediaKeyException } from "./exceptions/media.exception.js";

/**
 * A media key: nested path segments, then a file name with a type the storefront serves.
 *
 * The character class is what makes `..` unrepresentable rather than merely filtered — a segment of
 * dots does not match it — and the extension list is what keeps an uploaded `.php` or `.html` out of a
 * tree that is served statically.
 */
const MEDIA_FILE_PATTERN =
  /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:jpe?g|png|webp|gif|avif|mp4|webm|pdf)$/i;

/** Is this a key the media library may hold, and may be deleted by? */
export function isSafeMediaKey(key: string): boolean {
  return !key.includes("..") && !key.startsWith("/") && MEDIA_FILE_PATTERN.test(key);
}

/**
 * Delete a file from the local tree, refusing anything that resolves outside it.
 *
 * The second check is not redundant with the first. `isSafeMediaKey` rejects a key that *contains*
 * `..`; this one re-checks the resolved path against the root, because a resolve that lands outside
 * the root is the thing that actually matters and a pattern is a poor place to be the only guard
 * against it. A symlink under the media directory would pass the pattern and fail here.
 */
export async function deleteLocalMediaFile(root: string, key: string): Promise<void> {
  if (!isSafeMediaKey(key)) {
    throw new MediaKeyException();
  }

  const resolvedRoot = path.resolve(root);
  const relative = key.replace(/^media\//, "");
  const filePath = path.resolve(resolvedRoot, relative);
  if (!filePath.startsWith(resolvedRoot + path.sep)) {
    throw new MediaKeyException("مسیر نامعتبر است");
  }

  await fs.unlink(filePath);
}

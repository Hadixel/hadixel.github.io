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

import { randomBytes } from "node:crypto";

/** One entry in the media library: the key it is stored under, and the URL the storefront serves it from. */
export interface MediaItem {
  url: string;
  key: string;
}

/**
 * The types the media library accepts, as a MIME type to the extension it is stored under.
 *
 * SVG and HTML are absent on purpose, and the absence is the point: the local fallback is served
 * statically, so a `.svg` an operator uploads is a document that runs script in the shop's origin the
 * moment anyone opens it, and `.html` is the same thing with a different name. Neither can be made
 * safe by a header, and the only way to keep them out of a statically served tree is to never accept
 * them.
 */
const MIME_EXTENSIONS = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["application/pdf", "pdf"],
]);

/** The extension an upload of this content type is stored under, or null if the type is not accepted. */
export function extensionForContentType(contentType: string): string | null {
  return MIME_EXTENSIONS.get(contentType.toLowerCase().split(";")[0].trim()) ?? null;
}

/**
 * The extensions a *scraped product image* may have — a subset of the media library's.
 *
 * Narrower on purpose. A media library holds whatever an operator uploads, including the PDF a supplier
 * sent and the clip that is a product demonstration; a product's gallery holds photographs of that
 * product and nothing else, so a PDF in a variant gallery is either a mistake or something that will
 * render as a broken tile. The narrower set also means the bytes are always something an `<img>` can
 * display, which is the only thing the gallery does with them.
 */
export const PRODUCT_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "avif",
  "gif",
]);


/**
 * Do these bytes start like the type they claim to be?
 *
 * A content type is a claim the client makes about bytes it chose, so it is worth nothing on its own:
 * a `.jpg` that is really an HTML document is served as text/html by a static server and runs in the
 * shop's origin. Every accepted type has a magic number or a container signature, and this checks the
 * leading bytes against it.
 *
 * It is a check on the first bytes and not a decode, so a file that is a valid JPEG header followed by
 * a polyglot payload still passes. That is a real limit, not a solved problem: full validation means
 * decoding the image, which is a different and much more expensive thing. What this removes is the
 * trivial case, which is the one a static file server will happily serve.
 */
export function hasExpectedSignature(bytes: Buffer, extension: string): boolean {
  switch (extension) {
    case "jpg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "png":
      return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case "gif":
      return bytes.subarray(0, 6).toString("ascii") === "GIF87a" ||
        bytes.subarray(0, 6).toString("ascii") === "GIF89a";
    case "webp":
      return bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
        bytes.subarray(8, 12).toString("ascii") === "WEBP";
    case "avif":
      return bytes.subarray(4, 12).toString("ascii").includes("ftypavif");
    case "mp4":
      return bytes.subarray(4, 8).toString("ascii") === "ftyp";
    case "webm":
      return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
    case "pdf":
      return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
    default:
      return false;
  }
}

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

/**
 * A key for a new upload: `media/{year}/{month}/{random}.{ext}`.
 *
 * Generated here rather than in the client because the shape is a rule, not a formatting preference:
 * it keeps uploads in date order for the listing, and it never reuses a name, so an upload overwrites
 * nothing. Eight random bytes is enough that two operators uploading `photo.jpg` in the same month do
 * not collide, and the key stays inside the pattern `isSafeMediaKey` accepts — a generated key that
 * the library would later refuse to delete is not a key.
 */
export function mediaKey(ext: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const random = randomBytes(8).toString("hex");
  return `media/${year}/${month}/${random}.${ext.replace(/^\./, "")}`;
}

/** How many entries one listing will return. A list that cannot end is a denial of service on the operator. */
const MAX_LISTED_MEDIA = 1000;

/**
 * Resolve a key to a path inside the local root, refusing anything that lands outside it.
 *
 * The same two checks as the delete, for the same reason: the pattern is a poor place to be the only
 * guard against a path that resolves outside the tree, so the resolved path is compared to the root as
 * well. A key that satisfies `isSafeMediaKey` can still be written to by a symlink under the root.
 */
function resolveLocalPath(root: string, key: string): string {
  if (!isSafeMediaKey(key)) {
    throw new MediaKeyException();
  }
  const resolvedRoot = path.resolve(root);
  const filePath = path.resolve(resolvedRoot, key.replace(/^media\//, ""));
  if (!filePath.startsWith(resolvedRoot + path.sep)) {
    throw new MediaKeyException("مسیر نامعتبر است");
  }
  return filePath;
}

/**
 * Write an upload into the local tree and return the URL the storefront serves it from.
 *
 * The extension is judged before the file is opened. A key is safe if it *names* a served type, which
 * is not the same as the bytes being that type — and a multipart upload is the one place the caller
 * gets to choose a name, so the name is checked here rather than trusted from the client.
 */
export async function saveLocalMediaFile(
  root: string,
  key: string,
  body: Buffer,
): Promise<string> {
  const filePath = resolveLocalPath(root, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body);
  return `/media/${key.replace(/^media\//, "")}`;
}

/**
 * Walk the local tree and list what a media picker may offer.
 *
 * The keys come back namespaced with `media/`, because that is how the object store names them and the
 * two listings have to agree. A local walk rooted at the media directory produces paths *without* it —
 * `2026/09/abc.png` where S3 says `media/2026/09/abc.png` — and the two are not interchangeable: the
 * delete strips `media/` before resolving, so an unprefixed key deletes correctly by accident while a
 * namespaced one deletes correctly by design, and an operator who saw `2026/09/abc.png` in the picker
 * and pasted it back after an upload that returned `media/2026/09/abc.png` would be holding two
 * different strings for one file. The public URL drops the prefix again, since it is served from
 * `/media/…` and the segment would otherwise appear twice.
 *
 * Newest first, because a picker is looking for what was just uploaded. The walk stops at
 * `MAX_LISTED_MEDIA` rather than reading a whole tree into memory: the cap is on the *result*, so the
 * recursion unwinds as soon as it is reached instead of finishing the directory and discarding.
 */
export async function listLocalMedia(root: string): Promise<MediaItem[]> {
  const items: MediaItem[] = [];

  const walk = async (dir: string, prefix: string): Promise<void> => {
    if (items.length >= MAX_LISTED_MEDIA) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      // A media directory that does not exist yet is an empty library, not a failure. The tree is
      // created by the first upload; refusing to list before then would break the picker on a fresh
      // install for no reason.
      return;
    }
    for (const entry of entries) {
      if (items.length >= MAX_LISTED_MEDIA) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, `${prefix}${entry.name}/`);
      } else {
        const key = `media/${prefix}${entry.name}`;
        if (isSafeMediaKey(key)) {
          items.push({ key, url: `/media/${prefix}${entry.name}` });
        }
      }
    }
  };

  await walk(path.resolve(root), "");
  return items.sort((a, b) => b.key.localeCompare(a.key));
}

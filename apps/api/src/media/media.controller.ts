// Media, at the operator's edge — the delete, which is the one write the library has.
//
// Two things make this worth a gateway route rather than a panel helper. The key rule is a *security*
// rule: a key that can climb out of the media directory, or that names a type the storefront will not
// serve, is a request to reach something the library is not — and the panel held it as an unexported
// function, enforced by whichever caller remembered it. And the audit line: the panel wrote it after
// the file was gone, so a failed audit write was a deleted file nobody could account for.
//
// The local root is configuration rather than a `process.cwd()`-relative path, which is the one thing
// that had to change for the delete to be able to move. See `ConfigService.mediaLocalRoot`.

import { createHash } from "node:crypto";
import { Controller, Delete, Get, Inject, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { createStorage, storageConfigFromEnv } from "../storage/storage.js";
import { writeAudit } from "../common/audit.js";
import { AuthService } from "../auth/auth.service.js";
import { requireAdmin } from "../auth/identity.js";
import { ConfigService } from "../config/config.service.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { PrismaClient } from "../prisma/index.js";
import {
  MediaDeleteException,
  MediaKeyException,
  MediaRootMissingException,
  MediaStorageMissingException,
  MediaUploadException,
} from "./exceptions/media.exception.js";
import {
  deleteLocalMediaFile,
  extensionForContentType,
  hasExpectedSignature,
  isSafeMediaKey,
  listLocalMedia,
  mediaKey,
  saveLocalMediaFile,
  PRODUCT_IMAGE_EXTENSIONS,
  type MediaItem,
} from "./media.service.js";

/**
 * S3 keys come back with the configured prefix attached, but the panel and the storefront both work in
 * keys *without* it — `media/2026/09/abc.jpg`, not `prod/media/2026/09/abc.jpg`. A listing that kept
 * the prefix would show keys the delete route then has to strip again, so the prefix is removed once,
 * here, and the operator sees the same key the delete takes.
 */
function stripStoragePrefix(key: string, prefix?: string): string {
  return prefix && key.startsWith(`${prefix}/`) ? key.slice(prefix.length + 1) : key;
}

/**
 * Read a request's raw body.
 *
 * The upload arrives as bytes rather than multipart precisely so this is the only place a body is
 * decoded, and it is bounded: an operator's upload is a photo, and a body that can grow without limit
 * is a way to exhaust the process's memory from an authenticated session.
 */
async function readBody(req: Request): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) {
      throw new MediaUploadException("حجم فایل بیش از حد مجاز است");
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** An operator image or a short clip, not a disk image. 32 MiB is well past any real product photo. */
const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

@Controller("media")
export class MediaController {
  constructor(
    private readonly auth: AuthService,
    // The data client arrives through the module that owns it, the same as every other feature; the
    // audit line is the only thing here that needs it.
    @Inject(DATA_CLIENT) private readonly db: PrismaClient,
    private readonly config: ConfigService,
  ) {}

  /**
   * The local media root, or a refusal.
   *
   * Configuration, not a `process.cwd()`-relative path. This is the whole reason the panel's media
   * could not simply be pointed here: it resolved `public/media` against *its own* working directory,
   * so a panel and a gateway started from different directories wrote to two different directories
   * that both called themselves the media library, and only the gateway's was the one the storefront
   * served.
   */
  private requireLocalRoot(): string {
    const root = this.config.mediaLocalRoot;
    if (!root) throw new MediaRootMissingException();
    return root;
  }

  /**
   * Delete one file from the library.
   *
   * A file is not a row, so there is no transaction to wrap this in — which is exactly why the audit
   * line is written *after* a successful delete and not inside a transaction with it. The ordering is
   * the honest one: a delete that failed leaves no line, and a delete that succeeded always does,
   * because the line is written on the path that only a completed delete reaches.
   */
  @Delete(":key")
  async remove(@Req() req: Request, @Param("key") key: string): Promise<{ deleted: true }> {
    const admin = await requireAdmin(this.auth, req);

    // The key is judged before anything is asked of the configuration, so a traversal attempt is
    // refused the same way in every deployment rather than only in the one that happens to have a
    // local root. A rule whose enforcement depends on how the service is configured is not a rule.
    if (!isSafeMediaKey(key)) {
      throw new MediaKeyException();
    }

    const config = storageConfigFromEnv();
    if (config) {
      const storage = createStorage(config);
      try {
        await storage.delete(key);
      } catch (error) {
        // The driver's wording is not a sentence an operator can act on, so it is summarised and the
        // detail is left to the logs.
        throw new MediaDeleteException(
          `فایل حذف نشد: ${error instanceof Error ? error.message : "خطای نامشخص"}`,
        );
      }
    } else {
      // Refused rather than guessed. The panel's fallback resolved `public/media` against its own
      // working directory, which in this process would be a directory that does not exist.
      try {
        await deleteLocalMediaFile(this.requireLocalRoot(), key);
      } catch (error) {
        if (error instanceof Error && error.name === "MediaKeyException") throw error;
        throw new MediaDeleteException(
          `فایل حذف نشد: ${error instanceof Error ? error.message : "خطای نامشخص"}`,
        );
      }
    }

    await writeAudit(this.db, {
      adminUserId: admin.id,
      action: "MEDIA_DELETED",
      entityType: "MEDIA",
      entityId: key,
      meta: { key: key },
    });

    return { deleted: true };
  }

  /** Whether a key is one the library may hold. Served so a client can grey out what it cannot delete. */
  @Get("check/:key")
  checkKey(@Param("key") key: string): { safe: boolean } {
    return { safe: isSafeMediaKey(key) };
  }

  /**
   * The media library, for the picker.
   *
   * The listing is a read, so it would be a candidate for the panel to do; it is here because the walk
   * has to know which keys the library may hold, and that rule is not something to re-implement in a
   * second process. The panel's own listing filtered by its own copy of the pattern, so a key the
   * gateway would refuse to delete could still be offered for upload, and the two answers to "is this
   * key good" did not have to agree.
   */
  @Get()
  async list(@Req() req: Request): Promise<{ items: MediaItem[] }> {
    await requireAdmin(this.auth, req);

    const config = storageConfigFromEnv();
    if (config) {
      const storage = createStorage(config);
      const keys = await storage.list("media/");
      return {
        items: keys
          .map((key) => stripStoragePrefix(key, config.prefix))
          .filter(isSafeMediaKey)
          .map((key) => ({ key, url: storage.getUrl(key) })),
      };
    }

    const root = this.config.mediaLocalRoot;
    if (!root) throw new MediaRootMissingException();
    return { items: await listLocalMedia(root) };
  }

  /**
   * Accept an upload and write it into the library.
   *
   * The key is generated here, from the extension the client names, and is then put through
   * `isSafeMediaKey` before a single byte is written. The client asking for a key is a client choosing
   * a filename, and the extension is the only part of it that matters — an upload named `x.php` must
   * not reach a tree the storefront serves statically, and a route that trusts the caller's key is a
   * route where that depends on the caller.
   *
   * The body arrives as the raw bytes with the type in a header rather than as multipart: the panel
   * forwards the file it received, and a second parser between the operator's browser and the process
   * that owns the media library is one more thing to get wrong.
   */
  @Post()
  async upload(@Req() req: Request): Promise<MediaItem> {
    const admin = await requireAdmin(this.auth, req);

    // The type the client claims decides the extension, and the extension decides the key, so both come
    // from one header rather than from two that can disagree. Letting the client name its own extension
    // would mean a request that asks for a `.jpg` and stores a `.html`.
    const contentType = req.headers["content-type"] ?? "";
    const extension = extensionForContentType(contentType);
    if (!extension) {
      throw new MediaUploadException("نوع فایل مجاز نیست");
    }

    const body = await readBody(req);
    if (body.length === 0) {
      throw new MediaUploadException("فایلی ارسال نشده است");
    }
    if (!hasExpectedSignature(body, extension)) {
      throw new MediaUploadException("محتوای فایل با نوع آن مطابقت ندارد");
    }

    const key = mediaKey(extension);
    // Re-judged rather than assumed: the pattern is what makes `..` unrepresentable, and a generated
    // key that the library would later refuse to delete is a key that cannot be cleaned up.
    if (!isSafeMediaKey(key)) {
      throw new MediaKeyException("نوع فایل پشتیبانی نمی‌شود");
    }

    const config = storageConfigFromEnv();
    const url = config
      ? await createStorage(config).upload({ key, body, contentType })
      : await saveLocalMediaFile(this.requireLocalRoot(), key, body);

    await writeAudit(this.db, {
      adminUserId: admin.id,
      action: "MEDIA_UPLOADED",
      entityType: "MEDIA",
      entityId: key,
      meta: { key, bytes: body.length },
    });

    return { key, url };
  }

  /**
   * Accept a scraped product image, addressed by its own content.
   *
   * Deliberately a different key space from the media library, and deliberately one where the *content*
   * names the key rather than a clock. Scraped images are content-addressed — the key is the SHA-256 of
   * the bytes — because the same photograph arrives again on the next scrape of the same page, and a
   * random name would grow the bucket every night for a picture the shop already has. That is also why
   * this route requires S3: a content-addressed key has no meaning in a local tree that the gateway
   * would have to walk, and the panel's local fallback wrote straight into `public/products` instead.
   *
   * The only part a caller supplies is the colour, and it is constrained to something that can be a
   * variant name rather than a path. The digest alone identifies the bytes, so two colours sharing a
   * photograph is not a mistake to prevent — and because the key is derived from a hash of the body
   * here rather than accepted from the caller, this cannot be used to write to an arbitrary key.
   */
  @Post("product-images")
  async uploadProductImage(@Req() req: Request): Promise<{ url: string; key: string }> {
    const admin = await requireAdmin(this.auth, req);

    const config = storageConfigFromEnv();
    if (!config) {
      throw new MediaStorageMissingException();
    }

    const contentType = req.headers["content-type"] ?? "";
    const extension = extensionForContentType(contentType);
    if (!extension || !PRODUCT_IMAGE_EXTENSIONS.has(extension)) {
      throw new MediaUploadException("نوع فایل مجاز نیست");
    }

    const body = await readBody(req);
    if (body.length === 0) {
      throw new MediaUploadException("فایلی ارسال نشده است");
    }
    if (!hasExpectedSignature(body, extension)) {
      throw new MediaUploadException("محتوای فایل با نوع آن مطابقت ندارد");
    }

    const color = String(req.query["color"] ?? "").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(color)) {
      throw new MediaKeyException("رنگ نامعتبر است");
    }

    const key = `scraper/products/${color}/${createHash("sha256").update(body).digest("hex")}${extension}`;
    if (!isSafeMediaKey(key)) {
      throw new MediaKeyException("کلید نامعتبر است");
    }

    // No audit line per image. A scrape uploads a hundred of these, and one line each would bury every
    // other entry in the trail. The scrape as a whole is already recorded by whoever started it; what
    // this route writes is content, not an operator decision.
    void admin;
    const url = await createStorage(config).upload({ key, body, contentType });
    return { url, key };
  }
}

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

import { Controller, Delete, Get, Inject, Param, Req } from "@nestjs/common";
import type { Request } from "express";
import { createStorage, storageConfigFromEnv } from "../storage/storage.js";
import { writeAudit } from "../common/audit.js";
import { AuthService } from "../auth/auth.service.js";
import { requireAdmin } from "../auth/identity.js";
import { ConfigService } from "../config/config.service.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import {
  MediaDeleteException,
  MediaKeyException,
  MediaRootMissingException,
} from "./exceptions/media.exception.js";
import { deleteLocalMediaFile, isSafeMediaKey } from "./media.service.js";

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
      const root = this.config.mediaLocalRoot;
      if (!root) throw new MediaRootMissingException();
      try {
        await deleteLocalMediaFile(root, key);
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
}

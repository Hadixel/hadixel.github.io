import { HttpStatus } from "@nestjs/common";
import { GatewayException } from "../../common/exceptions/gateway.exception.js";

/**
 * A key that is not a media key.
 *
 * A 400 rather than a 404, and the distinction is the point: the key was *refused*, not looked for and
 * not found. The panel threw a bare `Error("مسیر یا نوع فایل نامعتبر است")` and its action caught every
 * error into "حذف نشد: …", so a traversal attempt and a missing file were the same sentence.
 */
export class MediaKeyException extends GatewayException {
  constructor(message = "مسیر یا نوع فایل نامعتبر است") {
    super(HttpStatus.BAD_REQUEST, message);
  }
}

/**
 * A delete that could not be carried out.
 *
 * A 409 rather than a 500: the request was fine and the world said no — the object store refused, or
 * the local file is gone. The panel reported both as "حذف نشد: <driver text>", which is the driver's
 * wording shown to an operator.
 */
export class MediaDeleteException extends GatewayException {
  constructor(message = "فایل حذف نشد") {
    super(HttpStatus.CONFLICT, message);
  }
}

/**
 * A local media root the gateway was not told about.
 *
 * Refused rather than guessed. A gateway with no `MEDIA_LOCAL_ROOT` and no S3 configuration has
 * nowhere to delete from, and resolving a path relative to the directory it happened to be started in
 * is how a delete ends up addressing a tree nobody meant.
 */
export class MediaRootMissingException extends GatewayException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      "مسیر فایل‌های محلی پیکربندی نشده است؛ MEDIA_LOCAL_ROOT را تنظیم کنید",
    );
  }
}

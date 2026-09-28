import { HttpStatus } from "@nestjs/common";
import { GatewayException } from "../../common/exceptions/gateway.exception.js";

/** A page that is not there. The panel's update against a stale id was an unhandled driver error. */
export class PageNotFoundException extends GatewayException {
  constructor(message = "صفحه پیدا نشد.") {
    super(HttpStatus.NOT_FOUND, message);
  }
}

/**
 * A rule about what a page may be, refused with the sentence naming the field or the block.
 *
 * The panel had one generic "ذخیره انجام نشد؛ دوباره تلاش کنید" for every one of these, which is the
 * worst possible answer to a form that knows exactly which block the operator was looking at.
 */
export class PageRuleException extends GatewayException {
  constructor(message: string) {
    super(HttpStatus.BAD_REQUEST, message);
  }
}

/**
 * A slug another page holds.
 *
 * Asked rather than caught, for the reason the category's equivalent is asked: the panel matched the
 * text of a Prisma error (`msg.includes("slug") && msg.includes("Unique")`), which is a rule about a
 * driver's wording.
 */
export class PageSlugTakenException extends GatewayException {
  constructor(slug: string) {
    super(HttpStatus.CONFLICT, `این اسلاگ قبلاً استفاده شده است: ${slug}`);
  }
}

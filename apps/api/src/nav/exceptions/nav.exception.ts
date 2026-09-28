import { HttpStatus } from "@nestjs/common";
import { GatewayException } from "../../common/exceptions/gateway.exception.js";

/**
 * A location the shop has no menu for.
 *
 * A 404 rather than a 400: the caller asked for something that is not there, which is a different kind
 * of answer from "store a value that is not allowed". The panel answered both with the same sentence,
 * so a stale form and a typo looked alike.
 */
export class MenuNotFoundException extends GatewayException {
  constructor(location: string) {
    super(HttpStatus.NOT_FOUND, `منوی «${location}» پیدا نشد.`);
  }
}

/**
 * A rule about what a menu may be, refused with the sentence naming what was wrong.
 *
 * The panel threw bare `Error("NAV_DEPTH")` and matched the text afterwards, which is a rule about a
 * string rather than about a menu.
 */
export class NavRuleException extends GatewayException {
  constructor(message: string) {
    super(HttpStatus.BAD_REQUEST, message);
  }
}

/**
 * A link pointing at something that is not there.
 *
 * Names the item, because "one of the links points at a missing target" sends an operator hunting
 * through a tree of forty items for the one that is wrong. The ids are what the editor sent, so they
 * are the one thing they can search for.
 */
export class NavTargetMissingException extends GatewayException {
  constructor(missing: string[]) {
    super(HttpStatus.CONFLICT, `این لینک‌ها به مقصد موجود اشاره می‌کنند: ${missing.join("، ")}`);
  }
}

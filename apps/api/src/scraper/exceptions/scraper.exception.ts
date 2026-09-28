// The scraper import's own refusals.
//
// A scraper's mistakes are not malformed requests in the usual sense: the body is well-formed, the
// session is valid, and the answer is still no — a category nobody supports, a duplicate SKU that
// belongs to another product, a price missing from something about to be published. Those deserve
// their own status rather than being reported as a 400, because 400 sends a caller looking at its own
// payload when the payload is exactly what the panel's review screen is supposed to send.
//
// Every message here is Persian prose for an operator, because the panel shows it verbatim. `GatewayException`
// is the base the error filter trusts, so a message written here survives to the screen — the same
// bargain every other feature's exception makes.

import { HttpStatus } from "@nestjs/common";
import { GatewayException } from "../../common/exceptions/gateway.exception.js";

/** 422: the request was understood, and this is not something the importer will do. */
export class ScraperRuleException extends GatewayException {
  constructor(message: string) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, message);
  }
}

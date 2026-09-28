import { HttpStatus } from "@nestjs/common";
import { GatewayException } from "../../common/exceptions/gateway.exception.js";

/**
 * A category, collection or product that is not there — or is there and not published.
 *
 * One exception for the three, because to a shopper they are the same answer and the three routes
 * that raise it answer the same question. A draft and an absent row are deliberately indistinguishable
 * here: a storefront that can tell them apart is a storefront an operator's unfinished work is
 * reachable through.
 *
 * The Persian message is a shopper's, not an operator's. The operator's reads live in the features
 * that require a session.
 */
export class CatalogueNotFoundException extends GatewayException {
  constructor(message = "موردی که خواستید پیدا نشد.") {
    super(HttpStatus.NOT_FOUND, message);
  }
}

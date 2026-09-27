import { HttpStatus } from "@nestjs/common";
import { GatewayException } from "../../common/exceptions/gateway.exception.js";

/** A collection that is not there. The panel's delete had no existence check at all. */
export class CollectionNotFoundException extends GatewayException {
  constructor(message = "مجموعه پیدا نشد.") {
    super(HttpStatus.NOT_FOUND, message);
  }
}

/**
 * A collection's slug is taken.
 *
 * Asked rather than caught, for the reason the category's equivalent is asked: the panel matched the
 * *text* of a Prisma error, which is a rule about a driver's wording, and which reports a collision
 * and an unrelated failure with the same sentence.
 */
export class CollectionSlugTakenException extends GatewayException {
  constructor(slug: string) {
    super(HttpStatus.CONFLICT, `اسلاگ «${slug}» قبلاً استفاده شده است.`);
  }
}

/**
 * A product the collection names that is not in the catalogue.
 *
 * Names the ids, because this is what a collection edited after a product was deleted actually
 * contains, and "one of the products was not found" sends the operator hunting through the form for
 * a row they cannot see. A stale membership is a conflict with the catalogue rather than a bad
 * request: the operator's form was well-formed.
 */
export class CollectionProductMissingException extends GatewayException {
  constructor(missing: string[]) {
    super(HttpStatus.CONFLICT, `این محصولات در مجموعه پیدا نشدند: ${missing.join("، ")}`);
  }
}

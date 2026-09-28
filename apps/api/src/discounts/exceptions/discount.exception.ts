import { HttpStatus } from "@nestjs/common";
import { GatewayException } from "../../common/exceptions/gateway.exception.js";

/** A discount that is not there. The panel's delete had no existence check at all. */
export class DiscountNotFoundException extends GatewayException {
  constructor(message = "تخفیف پیدا نشد.") {
    super(HttpStatus.NOT_FOUND, message);
  }
}

/**
 * A code another coupon already holds.
 *
 * Asked rather than caught, for the reason the category's slug collision is asked: the panel matched
 * the *text* of a Prisma error (`msg.includes("code") && msg.includes("Unique")`), which is a rule
 * about a driver's wording and reports a collision and an unrelated failure with the same sentence.
 */
export class DiscountCodeTakenException extends GatewayException {
  constructor(code: string) {
    super(HttpStatus.CONFLICT, `کد «${code}» قبلاً استفاده شده است.`);
  }
}

/**
 * A rule about what a discount may be, refused with the sentence that names the field.
 *
 * One class rather than one per rule, because they are all the same answer to the operator's question
 * — "this discount is not allowed to look like that" — and the message says which. The panel returned
 * a single generic "ذخیره انجام نشد؛ دوباره تلاش کنید" for all of them, which is the worst possible
 * answer to a form that knows exactly which field the operator was editing.
 */
export class DiscountRuleException extends GatewayException {
  constructor(message: string) {
    super(HttpStatus.BAD_REQUEST, message);
  }
}

/**
 * A target the discount names that is not in the catalogue.
 *
 * Names the ids, because this is what a discount edited after a product was deleted actually
 * contains, and "one of the targets was not found" sends the operator hunting through a form for
 * rows they cannot see — the missing ones are exactly the rows the form still lists and the database
 * no longer has. Same reasoning as the collection's equivalent, and the same status: the form was
 * well-formed, the world moved under it.
 */
export class DiscountTargetMissingException extends GatewayException {
  constructor(kind: string, missing: string[]) {
    super(HttpStatus.CONFLICT, `این ${kind} در فروشگاه پیدا نشدند: ${missing.join("، ")}`);
  }
}

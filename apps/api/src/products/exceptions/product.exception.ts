import { HttpStatus } from "@nestjs/common";
import { GatewayException } from "../../common/exceptions/gateway.exception.js";

/** A product that is not there. The panel's `product.update` against a stale id was a driver error. */
export class ProductNotFoundException extends GatewayException {
  constructor(message = "محصول پیدا نشد.") {
    super(HttpStatus.NOT_FOUND, message);
  }
}

/**
 * A rule about what a product may be, refused with the sentence naming the field.
 *
 * One class for all of them, because they answer the operator's same question — "this product is not
 * allowed to look like that" — and the message says which. The panel answered every one of them with
 * "ذخیره انجام نشد؛ دوباره تلاش کنید", which is the worst possible answer to a form that knows
 * exactly which field the operator was editing.
 */
export class ProductRuleException extends GatewayException {
  constructor(message: string) {
    super(HttpStatus.BAD_REQUEST, message);
  }
}

/**
 * A variant the form named that is not this product's.
 *
 * Its own status because it is a conflict rather than a bad request: the form was well-formed, and the
 * id it carried belongs to something else — usually a row from a product the operator edited a moment
 * ago. The panel detected it by throwing a bare `Error("VARIANT_OWNERSHIP")` from inside its
 * transaction and matching the *text* of that error afterwards, which is a rule about a string.
 */
export class VariantOwnershipException extends GatewayException {
  constructor(message = "شناسه تنوع متعلق به این محصول نیست") {
    super(HttpStatus.CONFLICT, message);
  }
}

/**
 * A slug another product already holds.
 *
 * Asked rather than caught, for the reason the category's equivalent is asked: the panel matched the
 * text of a Prisma error (`msg.includes("slug") && msg.includes("Unique")`), which is a rule about a
 * driver's wording and reports a collision and an unrelated failure with the same sentence.
 */
export class ProductSlugTakenException extends GatewayException {
  constructor(slug: string) {
    super(HttpStatus.CONFLICT, `این اسلاگ قبلاً استفاده شده است: ${slug}`);
  }
}

/**
 * A SKU another variant already holds.
 *
 * The column is genuinely `@unique`, so the index is what actually enforces this; asking is what turns
 * a driver error into a sentence naming the SKU, which is the one thing an operator can act on when
 * two rows in a list have the same code.
 */
export class ProductSkuTakenException extends GatewayException {
  constructor(sku: string) {
    super(HttpStatus.CONFLICT, `یکی از SKUها تکراری است: ${sku}`);
  }
}

/** A category that is not there — the panel let the foreign key raise it. */
export class ProductCategoryException extends GatewayException {
  constructor(message = "دسته‌بندی معتبر نیست") {
    super(HttpStatus.BAD_REQUEST, message);
  }
}

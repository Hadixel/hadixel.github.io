import { HttpStatus } from "@nestjs/common";
import { GatewayException } from "../../common/exceptions/gateway.exception.js";

/**
 * A category that is not there.
 *
 * Its own class rather than the shared `NotFoundException` because the panel's copy of this rule
 * answered "دسته پیدا نشد" for a missing category and "ذخیره انجام نشد" for a foreign key that no
 * longer resolved — two different faults behind one message, and the second is the one an operator
 * needs to act on.
 */
export class CategoryNotFoundException extends GatewayException {
  constructor(message = "دسته‌بندی پیدا نشد.") {
    super(HttpStatus.NOT_FOUND, message);
  }
}

/**
 * A category's slug is taken by another one.
 *
 * The panel decided this by reading the text of a Prisma error — `msg.includes("slug") &&
 * msg.includes("Unique")` — which is a rule about a driver's wording. It also has the wrong failure
 * mode: an error whose wording changes stops being recognised, and a save that is refused for
 * another reason reports "ذخیره انجام نشد" with no way to tell a collision from a failure.
 *
 * Checked explicitly here, so the refusal is a decision the gateway makes rather than a sentence
 * parsed out of somebody else's exception.
 */
export class CategorySlugTakenException extends GatewayException {
  constructor(slug: string) {
    super(HttpStatus.CONFLICT, `اسلاگ «${slug}» قبلاً استفاده شده است.`);
  }
}

/**
 * A category that still has something under it.
 *
 * A conflict rather than a bad request: the operator's id was fine and the category is not wrong, it
 * is not empty. The distinction matters because the two call for different responses — a bad request
 * means retype the form, this one means empty the category first.
 */
export class CategoryNotEmptyException extends GatewayException {
  constructor(message = "دسته دارای زیردسته یا محصول است و حذف نمی‌شود.") {
    super(HttpStatus.CONFLICT, message);
  }
}

/**
 * A parent the tree will not accept.
 *
 * One class for all three parent faults — absent, already a child, and the category itself — because
 * the operator's response is the same in each case: fix the parent field. What differs is the
 * sentence, and the sentence is the constructor's argument, so the three remain distinguishable in the
 * log and in the trail without being three classes the error filter has to know about.
 *
 * A bad request rather than a not-found. The category being saved is fine; the thing it points at is
 * not usable as a parent, and "پیدا نشد" for a category that is plainly on the page sends the
 * operator looking for a row that is right there.
 */
export class CategoryParentException extends GatewayException {
  constructor(message: string) {
    super(HttpStatus.BAD_REQUEST, message);
  }
}

/**
 * A spec field belonging to a different category.
 *
 * A bad request rather than a not-found. The id is real, the form simply named it on a category it
 * does not belong to, and telling the operator it does not exist would send them looking for a
 * category that is right there on the page.
 */
export class SpecFieldOwnershipException extends GatewayException {
  constructor(message = "شناسه فیلد مشخصات متعلق به این دسته نیست.") {
    super(HttpStatus.BAD_REQUEST, message);
  }
}

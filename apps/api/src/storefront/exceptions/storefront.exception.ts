import { NotFoundException } from "../../common/exceptions/gateway.exception.js";

/**
 * No such post, or one that was never published.
 *
 * A 404 and not an empty post, and the two are not the same answer. A draft that renders as a blank
 * article reads as a broken site rather than a page that does not exist, and an empty object handed
 * to a route that asks for `title` renders a heading-less page for the same reason. Throwing here is
 * what makes the storefront's own `notFound()` fire instead.
 */
export class PostNotFoundException extends NotFoundException {
  constructor() {
    super("مطلب مورد نظر پیدا نشد.");
  }
}

import { HttpStatus } from "@nestjs/common";
import { GatewayException } from "../../common/exceptions/gateway.exception.js";

/**
 * An order that is not the caller's, or not there.
 *
 * One exception for both cases on purpose. Telling a shopper "this order exists but is not yours"
 * confirms an order number to someone guessing them, so the two are answered identically.
 */
export class OrderNotFoundException extends GatewayException {
  constructor(message = "سفارش مورد نظر پیدا نشد.") {
    super(HttpStatus.NOT_FOUND, message);
  }
}

/**
 * A status change the server will not accept.
 *
 * The panel renders its buttons from the transitions the gateway serves, so reaching this means the
 * client offered something stale — a tab left open across someone else's change. The message says so,
 * because "not allowed" with no reason sends an operator looking for a permissions problem.
 */
export class TransitionNotAllowedException extends GatewayException {
  constructor(from: string, to: string) {
    super(HttpStatus.CONFLICT, `تغییر وضعیت از «${from}» به «${to}» مجاز نیست.`);
  }
}

/** The order changed underneath a status form that was rendered before the change. */
export class OrderChangedException extends GatewayException {
  constructor(message = "وضعیت سفارش هم‌زمان تغییر کرده است؛ صفحه را تازه‌سازی کنید.") {
    super(HttpStatus.CONFLICT, message);
  }
}

/** Not enough sellable stock for the lines requested. */
export class InsufficientStockException extends GatewayException {
  constructor(message = "موجودی برای این سفارش کافی نیست.") {
    super(HttpStatus.CONFLICT, message);
  }
}

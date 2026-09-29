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

/**
 * A manual order that cannot be placed, with the operator's own sentence attached.
 *
 * The panel used to throw bare strings from inside a transaction and map them back to Persian in a
 * catch block, so the message travelled in two pieces that could disagree — and a message the panel
 * invented for a rule it did not hold. Carrying it on the exception means the server that knows why
 * also says why, and the operator is never told "try again" for a missing customer.
 */
export class OrderRuleViolation extends GatewayException {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, message);
  }
}

/**
 * An online payment asked for from a gateway that has no payment provider configured.
 *
 * A 503 and a distinct exception, because the storefront used to answer this by reading the provider's
 * credentials out of its *own* environment. Two processes held the merchant's credentials, and either
 * could have been configured without the other — so a checkout page could offer online payment that the
 * gateway would then refuse to start, and a shopper who chose it was told to try again. The gateway now
 * answers the question once, from the configuration it actually has.
 */
export class PaymentProviderMissingException extends GatewayException {
  constructor() {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      "درگاه پرداخت آنلاین پیکربندی نشده است",
    );
  }
}

import { HttpStatus } from "@nestjs/common";
import { GatewayException } from "../../common/exceptions/gateway.exception.js";

/**
 * A checkout rule the request does not satisfy.
 *
 * One exception for every refused checkout rather than a class each, because the shopper is owed an
 * answer in every case and the difference between them is a sentence, not a type. Each carries Persian
 * prose written for a customer.
 */
export class CheckoutRuleViolation extends GatewayException {
  constructor(message: string) {
    super(HttpStatus.BAD_REQUEST, message);
  }
}

/** The chosen city is not in the chosen province. */
export class CityProvinceMismatch extends GatewayException {
  constructor(message = "شهر انتخابی با استان همخوانی ندارد.") {
    super(HttpStatus.BAD_REQUEST, message);
  }
}

/** A basket line the gateway cannot price, usually a variant that no longer exists. */
export class UnknownVariant extends GatewayException {
  constructor(message = "یکی از محصولات سبد دیگر موجود نیست.") {
    super(HttpStatus.BAD_REQUEST, message);
  }
}

/** Not enough sellable stock for the whole order. */
export class InsufficientStockForOrder extends GatewayException {
  constructor(message = "موجودی برای همه اقلام سفارش کافی نیست.") {
    super(HttpStatus.CONFLICT, message);
  }
}

/** The customer already has an order awaiting payment. */
export class UnpaidOrderExists extends GatewayException {
  constructor(message = "یک سفارش در انتظار پرداخت دارید.") {
    super(HttpStatus.CONFLICT, message);
  }
}

import { HttpStatus } from "@nestjs/common";
import { GatewayException } from "../../common/exceptions/gateway.exception.js";

/**
 * A customer the operator asked for by an id that names nobody.
 *
 * A 404 rather than an empty page. The panel used to call `notFound()` on a missing row, which
 * renders a 404 page that looks exactly like a customer with no orders and no addresses — two very
 * different facts told with the same screen, on the screen where an operator decides whether to
 * chase an order.
 */
export class CustomerNotFoundException extends GatewayException {
  constructor(message = "مشتری پیدا نشد.") {
    super(HttpStatus.NOT_FOUND, message);
  }
}

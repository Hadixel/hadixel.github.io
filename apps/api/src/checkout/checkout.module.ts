import { Module } from "@nestjs/common";
import { CartController, CheckoutController } from "./checkout.controller.js";
import { CheckoutService } from "./checkout.service.js";

/**
 * Checkout and cart, in the §7.3 shape.
 *
 * Two controllers because they answer to two different callers: a basket belongs to a device, while
 * placing an order belongs to a customer. Merging them would mean a rule about who is asking is one
 * `if` away from a rule about what a basket contains.
 */
@Module({
  controllers: [CheckoutController, CartController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}

import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DataModule } from "../prisma/prisma.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { ShopperController } from "./shopper.controller.js";
import { ShopperService } from "./shopper.service.js";

/**
 * The shopper's side of the shop: their own orders, and the payment window they pay within.
 *
 * Its own feature because every route on it answers "what does this one signed-in person get to see
 * or do", and the orders feature answers for an order's own sake — by id for a caller who holds one,
 * and for an operator who may hold any. The two questions overlap in one route and are the same
 * question nowhere else, which is why the overlap is a delegation rather than a second projection.
 *
 * It sits below Orders because the order read model is Orders' to define, and beside Auth because
 * every route here resolves a customer before it does anything else.
 */
@Module({
  imports: [AuthModule, DataModule, OrdersModule],
  controllers: [ShopperController],
  providers: [ShopperService],
})
export class ShopperModule {}

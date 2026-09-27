import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";

/**
 * One feature, in the §7.3 shape: module, controller, service, dto/, exceptions/.
 *
 * The stock lifecycle is imported by the service rather than provided here, because it is a set of
 * rules over the data tier rather than a thing this feature owns — `inventory.service.ts` is
 * deliberately free of Nest decorators so both this service and the tests can reach it without a
 * container.
 */
@Module({
  // The controller resolves who is asking, so it needs the session implementation.
  imports: [AuthModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

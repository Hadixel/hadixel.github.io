import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DataModule } from "../prisma/prisma.module.js";
import { CustomersController } from "./customers.controller.js";
import { CustomersService } from "./customers.service.js";

/**
 * The operator's customers: who they are, and what they have ordered.
 *
 * Declares `imports` and nothing else, like every feature. Its own module rather than a read bolted
 * onto orders, because a customer is reachable from the order form and the storefront's session
 * handling as well as from the panel, and none of those three is the reason the other two exist.
 */
@Module({
  imports: [AuthModule, DataModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}

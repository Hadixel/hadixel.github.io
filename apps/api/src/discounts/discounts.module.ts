import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DataModule } from "../prisma/prisma.module.js";
import { DiscountsController } from "./discounts.controller.js";

/**
 * The operator's discounts.
 *
 * Declares `imports` and nothing else, like every feature: the controller resolves who is asking
 * through `AuthModule` and writes through the data client that `DataModule` provides. The rules live
 * in `discounts.service.ts` as plain functions rather than as providers here, because they are pure
 * decisions about a discount's shape plus two existence checks — there is nothing to inject into them,
 * and keeping them out of the container is what lets a test drive them without one.
 */
@Module({
  imports: [AuthModule, DataModule],
  controllers: [DiscountsController],
})
export class DiscountsModule {}

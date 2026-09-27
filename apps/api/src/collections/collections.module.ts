import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DataModule } from "../prisma/prisma.module.js";
import { CollectionsController } from "./collections.controller.js";

/**
 * The operator's collections.
 *
 * Declares `imports` and nothing else, like every feature: the controller resolves who is asking
 * through `AuthModule` and writes through the data client that `DataModule` provides.
 */
@Module({
  imports: [AuthModule, DataModule],
  controllers: [CollectionsController],
})
export class CollectionsModule {}

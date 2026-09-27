import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DataModule } from "../prisma/prisma.module.js";
import { CategoriesController } from "./categories.controller.js";

/**
 * The operator's category tree.
 *
 * Declares `imports` and nothing else, like every feature: the controller resolves who is asking
 * through `AuthModule` and writes through the data client that `DataModule` provides. Neither is
 * re-exported, so a feature that needs them names them itself.
 */
@Module({
  imports: [AuthModule, DataModule],
  controllers: [CategoriesController],
})
export class CategoriesModule {}

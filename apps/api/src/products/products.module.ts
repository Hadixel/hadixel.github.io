import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DataModule } from "../prisma/prisma.module.js";
import { ProductsController } from "./products.controller.js";

/**
 * The operator's products.
 *
 * Declares `imports` and nothing else, like every feature. The variant diff and the product's rules
 * are plain functions in `products.service.ts`, and the stock floor and compare-and-set they call are
 * in `inventory.service.ts` — so this feature adds no stock logic of its own, which is the point:
 * there were three copies of those two rules and there is now one.
 */
@Module({
  imports: [AuthModule, DataModule],
  controllers: [ProductsController],
})
export class ProductsModule {}

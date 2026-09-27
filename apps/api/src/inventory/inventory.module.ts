import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DataModule } from "../prisma/prisma.module.js";
import { InventoryController } from "./inventory.controller.js";

/**
 * Stock, at the operator's edge.
 *
 * The module exists only for the controller. `inventory.service.ts` is not provided here and needs no
 * decorator: it is a set of rules over the data tier that the orders service and the tests both reach
 * directly, and wrapping it in a provider would mean the one file that owns the stock lifecycle could
 * only be called through a container.
 */
@Module({
  // The controller resolves who is asking and writes through the data client, so it needs both.
  imports: [AuthModule, DataModule],
  controllers: [InventoryController],
})
export class InventoryModule {}

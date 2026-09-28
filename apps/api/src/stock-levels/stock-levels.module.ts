import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DashboardModule } from "../dashboard/dashboard.module.js";
import { DataModule } from "../prisma/prisma.module.js";
import { StockLevelsController } from "./stock-levels.controller.js";
import { StockLevelsService } from "./stock-levels.service.js";

/**
 * The operator's stock list.
 *
 * A feature of its own rather than another route on `inventory`, which owns the stock *lifecycle* —
 * reserve, commit, release, restock — and is a set of plain functions the orders path calls without
 * a container. This is a view: rows, a threshold and a count, none of which the lifecycle needs.
 *
 * It imports `DashboardModule` for one thing, and the import is the point: the low-stock line is
 * resolved by `DashboardService.lowStockThreshold()` and by nothing else in the gateway, so the
 * panel's badge, the sidebar's count and this page's rows are all judged against one number. Reading
 * the setting here as well would be a second resolver, and the two would be free to disagree.
 */
@Module({
  imports: [AuthModule, DashboardModule, DataModule],
  controllers: [StockLevelsController],
  providers: [StockLevelsService],
})
export class StockLevelsModule {}

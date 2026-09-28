import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DataModule } from "../prisma/prisma.module.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";

/**
 * The panel's landing page.
 *
 * Its own feature rather than a read bolted onto orders or inventory, because it spans both: the
 * figures it answers with are counts over orders, variants, products, pages and posts, and putting it
 * in any one of them would make the other four a dependency of that one for no reason a caller could
 * see.
 */
@Module({
  imports: [AuthModule, DataModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  // Exported for one caller. `lowStockThreshold()` is the one place the shop's low-stock line is
  // resolved, and the operator's stock list needs the same number the dashboard's badges and its
  // low-stock table are drawn against — so it reads the line here rather than resolving the setting
  // a second time and hoping the two answers match.
  exports: [DashboardService],
})
export class DashboardModule {}

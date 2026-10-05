// The panel's front page, as one read.

import { Controller, Get, Inject, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service.js";
import { requireAdmin } from "../auth/identity.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { PrismaClient } from "../prisma/index.js";
import { DashboardService } from "./dashboard.service.js";

@Controller("dashboard")
export class DashboardController {
  constructor(
    private readonly auth: AuthService,
    private readonly dashboard: DashboardService,
    @Inject(DATA_CLIENT) private readonly db: PrismaClient,
  ) {}

  /**
   * What the panel's landing page shows.
   *
   * One read rather than five, and the reason is not the round trip. The five were five counts in five
   * tables written in the page, so the page and the rule behind each count were the same file — a
   * change to what "awaiting" means could not reach the page without rewriting the page. A read that
   * answers the page's question means the page names what it wants and the meaning stays here.
   *
   * The shell's two badges come from the same read, so the number in the sidebar and the number on the
   * page cannot disagree — they were two separate queries before, and a threshold change moved one.
   */
  @Get()
  async summary(@Req() req: Request) {
    await requireAdmin(this.auth, req);
    return this.dashboard.summary();
  }

  /**
   * The two badges the shell shows on every panel page.
   *
   * Deliberately not a slice of the summary above. A badge is on every page render, and a page render
   * that also wanted the dashboard's tables would be fetching ten low-stock rows and five orders to
   * draw two numbers in a sidebar.
   */
  @Get("badges")
  async badges(@Req() req: Request) {
    await requireAdmin(this.auth, req);
    const threshold = await this.dashboard.lowStockThreshold();
    const [awaitingOrders, lowStock] = await Promise.all([
      this.db.order.count({ where: { paymentStatus: "AWAITING" } }),
      this.db.variant.count({ where: { stock: { lte: threshold } } }),
    ]);
    return { awaitingOrders, lowStock };
  }
}

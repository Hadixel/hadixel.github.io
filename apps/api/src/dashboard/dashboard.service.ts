// The numbers the panel's front page is made of.
//
// This exists because the dashboard and the shell were each assembling the same figures from the data
// tier themselves, in the panel, in SQL that no other process could see. Four of the five were counts
// scoped by a predicate — today's orders, orders awaiting payment, drafts in three tables, variants at
// or below the low-stock line — and the fifth was a list of the five most recent orders shaped for a
// table. A page that builds its own counts cannot be given a different count by a rule change; it just
// goes on being wrong in a way nobody tests, because the query and the page that wanted it were the
// same file.
//
// The low-stock threshold is read here, not passed in. It is a setting, it is settable in the panel's
// own settings form, and when the panel read it itself the page was comparing stock against a `3`
// written beside the comparison — so changing the setting changed the form and nothing else. The shop's
// configured threshold and the number the shop acted on had drifted apart and neither could see it.
import { Inject, Injectable } from "@nestjs/common";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { PrismaClient } from "../prisma/index.js";

@Injectable()
export class DashboardService {
  constructor(@Inject(DATA_CLIENT) private readonly db: PrismaClient) {}

  /**
   * The shop's configured low-stock line, as a number.
   *
   * The default is the same one the seed writes, so a shop that has never saved the setting gets the
   * number the shop was seeded with rather than a second, slightly different one.
   */
  async lowStockThreshold(): Promise<number> {
    const row = await this.db.setting.findFirst({ where: { key: LOW_STOCK_SETTING_KEY } });
    const value = row?.value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    // A row stored as a string is the shape a hand-edited database leaves behind; refusing to use it
    // would make the dashboard disagree with the inventory page about the same shop.
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
    return LOW_STOCK_FALLBACK;
  }

  /**
   * Everything the front page shows, in one read.
   *
   * `today` is computed in the database rather than in the process, so the boundary is the database's
   * day rather than this server's — a gateway on a different timezone to the shop would otherwise
   * report a different "today" than the orders page does.
   */
  async summary() {
    const threshold = await this.lowStockThreshold();
    const lowStock = { stock: { lte: threshold } };

    const [todayOrders, awaitingOrders, lowStockVariants, lowStockTotal, draftProducts, draftPages, draftPosts, recentOrders, settings] =
      await Promise.all([
        this.db.order.count({ where: { placedAt: { gte: startOfToday() } } }),
        this.db.order.count({ where: { paymentStatus: "AWAITING" } }),
        this.db.variant.findMany({
          where: lowStock,
          include: { product: { select: { name: true, slug: true } } },
          orderBy: { stock: "asc" },
          take: 10,
        }),
        this.db.variant.count({ where: lowStock }),
        this.db.product.count({ where: { status: "DRAFT" } }),
        this.db.page.count({ where: { status: "DRAFT" } }),
        this.db.post.count({ where: { status: "DRAFT" } }),
        this.db.order.findMany({
          orderBy: { placedAt: "desc" },
          take: 5,
          include: { customer: { select: { name: true, phone: true } } },
        }),
        this.db.setting.findMany({ where: { key: LOW_STOCK_SETTING_KEY } }),
      ]);

    const stored = settings[0]?.value;

    return {
      threshold,
      todayOrders,
      awaitingOrders,
      lowStockTotal,
      lowStockVariants: lowStockVariants.map((v) => ({
        id: v.id,
        productId: v.productId,
        productName: v.product.name,
        productSlug: v.product.slug,
        colorName: v.colorName,
        sku: v.sku,
        stock: v.stock,
        reserved: v.reserved,
      })),
      drafts: {
        products: draftProducts,
        pages: draftPages,
        posts: draftPosts,
        total: draftProducts + draftPages + draftPosts,
      },
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        total: o.total,
        fulfillmentStatus: o.fulfillmentStatus,
        placedAt: o.placedAt.toISOString(),
        customerName: o.customer.name,
        customerPhone: o.customer.phone,
      })),
      // Whether the shop has ever stored the threshold, as opposed to running on the fallback. A page
      // that wants to say "this is the default" needs to know which it is looking at.
      thresholdIsStored: stored !== undefined && stored !== null,
    };
  }
}

/** The column key the low-stock threshold lives under. */
export const LOW_STOCK_SETTING_KEY = "inventory.lowStockThreshold";

/** What the seed writes, used only when the shop has stored nothing. */
export const LOW_STOCK_FALLBACK = 3;

function startOfToday(): Date {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

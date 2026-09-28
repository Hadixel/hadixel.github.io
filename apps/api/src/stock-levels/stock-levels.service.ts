// The operator's stock list: what is left of each thing the shop sells, and what is running out.
//
// This was the panel's inventory page, and it read the shop's low-stock line out of the settings
// table itself and then compared every row's stock against the number it had just read. That is two
// facts — the configured line and the number the page acted on — read from one place and compared in
// another, so the two could disagree without either being wrong on its own terms. The line is
// resolved once, by the dashboard's service, and the verdict "this row is at or below it" comes back
// with the row: a page that decides which of its own rows are low is holding a copy of the rule, and
// the copy is the part that drifts.

import { Inject, Injectable } from "@nestjs/common";
import { DashboardService } from "../dashboard/dashboard.service.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

/** One variant's level, as the inventory table renders it. */
export interface StockLevelRow {
  id: string;
  productId: string;
  productName: string;
  colorName: string;
  sku: string;
  stock: number;
  reserved: number;
  /** What a shopper can still buy: on the shelf, less what an unpaid order is holding. */
  available: number;
  /**
   * Whether this row is at or below the shop's configured line.
   *
   * Named for the page's "کم" badge and resolved against the same threshold the header prints, so a
   * badge and the count above it cannot be talking about different numbers.
   */
  isLow: boolean;
}

/** One page of stock, the line it is judged against, and how much of the shop is below it. */
export interface StockLevelPage {
  threshold: number;
  lowStockCount: number;
  rows: StockLevelRow[];
  total: number;
  page: number;
  size: number;
}

@Injectable()
export class StockLevelsService {
  constructor(
    @Inject(DATA_CLIENT) private readonly db: PrismaClient,
    // The line, resolved by the one service that resolves it. Injected rather than re-read so that
    // changing the setting moves the badge on this page, the sidebar's count and the dashboard's
    // list together, which is the whole reason the setting stopped being the panel's to read.
    private readonly dashboard: DashboardService,
  ) {}

  /**
   * The variant list, emptiest first, paged, with the line and how many variants are below it.
   *
   * `lowStockCount` is a count of the whole shop and is deliberately not narrowed by the search: it
   * is the number the header states about the shop, and a header that reads "۳ تنوع کم‌موجودی"
   * because the operator typed a SKU would be a number about the search rather than about the shop.
   */
  async list(input: { q?: string; page: number; size: number }): Promise<StockLevelPage> {
    const threshold = await this.dashboard.lowStockThreshold();
    const q = input.q?.trim();
    const where: Prisma.VariantWhereInput = q ? matchesSearch(q) : {};

    const [rows, total, lowStockCount] = await Promise.all([
      this.db.variant.findMany({
        where,
        // Emptiest first, which is the order an operator works in, and then by id so that two rows
        // with the same count cannot swap places between one page and the next — a paged list whose
        // order is not total shows the same variant on two pages and hides another on neither.
        orderBy: [{ stock: "asc" }, { id: "asc" }],
        skip: (input.page - 1) * input.size,
        take: input.size,
        select: {
          id: true,
          productId: true,
          colorName: true,
          sku: true,
          stock: true,
          reserved: true,
          product: { select: { name: true } },
        },
      }),
      this.db.variant.count({ where }),
      this.db.variant.count({ where: { stock: { lte: threshold } } }),
    ]);

    return {
      threshold,
      lowStockCount,
      rows: rows.map((row) => ({
        id: row.id,
        productId: row.productId,
        // Flattened here because the table links to the product and prints its name; a nested
        // `product.name` would leave the page reading a shape it was not given.
        productName: row.product.name,
        colorName: row.colorName,
        sku: row.sku,
        stock: row.stock,
        reserved: row.reserved,
        available: row.stock - row.reserved,
        isLow: row.stock <= threshold,
      })),
      total,
      page: input.page,
      size: input.size,
    };
  }
}

/**
 * The search, as the panel's own search box meant it: a SKU or a product name, either case.
 *
 * The name arm is a relation predicate rather than a join the panel could do itself, which is the
 * reason this read exists rather than a convenience.
 */
function matchesSearch(q: string): Prisma.VariantWhereInput {
  return {
    OR: [
      { sku: { contains: q, mode: "insensitive" } },
      { product: { name: { contains: q, mode: "insensitive" } } },
    ],
  };
}

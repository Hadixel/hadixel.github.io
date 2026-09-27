import { formatToman, toFaDigits } from "@kmodern/schema/format";
import { Inject, Injectable } from "@nestjs/common";
import { DATA_CLIENT } from "../prisma/prisma.module.js";
import type { createPrismaClient } from "../prisma/client.js";
import type { HomeDeal, HomeProduct } from "./dto/home.dto.js";

type Db = ReturnType<typeof createPrismaClient>;

/**
 * The read model the storefront's home page needs, in one place.
 *
 * This is the first code to move out of a client, and it is the tracer bullet every later resource
 * slice copies: the query, the mapping and the decision about what a shopper is allowed to see all
 * live in the gateway, and the client receives the result over HTTP.
 *
 * Two rules the storefront used to break:
 *
 * - Only `PUBLISHED` products, and only variants that are sellable (in stock, or backorderable).
 *   A draft leaking onto the home page is the kind of bug that is invisible in review and obvious
 *   to a customer, so the filter is here rather than in the caller's query string.
 * - Prices are the smallest and largest *sellable* variant, not the smallest variant overall: a
 *   sold-out cheap variant must not advertise a price nobody can buy at.
 */
@Injectable()
export class ContentService {
  constructor(@Inject(DATA_CLIENT) private readonly db: Db) {}

  /** The published blocks of a CMS page, or null when the page is absent or unpublished. */
  async publishedPage(slug: string): Promise<{ slug: string; publishedBlocks: unknown } | null> {
    const page = await this.db.page.findUnique({
      where: { slug, status: "PUBLISHED" },
      select: { slug: true, publishedBlocks: true },
    });
    return page;
  }

  async publishedProducts(limit: number): Promise<HomeProduct[]> {
    const products = await this.db.product.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        variants: {
          where: { OR: [{ stock: { gt: 0 } }, { allowBackorder: true }] },
          orderBy: { price: "asc" },
          select: {
            id: true,
            colorName: true,
            colorCode: true,
            images: true,
            price: true,
          },
        },
      },
      take: limit,
    });
    return products.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      model: p.model,
      category: p.category,
      price: p.variants.length ? Math.min(...p.variants.map((v) => v.price)) : 0,
      maxPrice: p.variants.length ? Math.max(...p.variants.map((v) => v.price)) : 0,
      available: p.variants.length > 0,
      image: p.variants[0]?.images?.[0] ?? null,
      variantCount: p.variants.length,
      dots: p.variants.map((v) => ({
        id: v.id,
        colorName: v.colorName,
        colorCode: v.colorCode,
        images: v.images,
        price: v.price,
      })),
    }));
  }

  /**
   * Special offers: active automatic discounts inside their window.
   *
   * Coupon-only codes are deliberately excluded. They are not a storefront section, and advertising
   * a code nobody can see is noise.
   *
   * A Discount names its products in a scalar `productIds` array rather than a relation, so there
   * is nothing to join: the discounts are read first, the products they name are read second, and
   * the two are joined here. The best discount per product wins, and the cap on a percentage
   * discount (`maxAmount`) is honoured — dropping either would silently overstate every offer on
   * the page.
   */
  async activeDeals(limit: number): Promise<HomeDeal[]> {
    const now = new Date();
    const discounts = await this.db.discount.findMany({
      where: {
        status: "ACTIVE",
        mode: "AUTOMATIC",
        type: { in: ["PERCENT", "FIXED"] },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      orderBy: { value: "desc" },
    });
    if (discounts.length === 0) return [];

    const productIds = [...new Set(discounts.flatMap((d) => d.productIds))].slice(0, limit * 2);
    if (productIds.length === 0) return [];

    const products = (await this.publishedProducts(100)).filter((p) => productIds.includes(p.id));
    const byId = new Map(products.map((p) => [p.id, p]));

    const deals: HomeDeal[] = [];
    for (const id of productIds) {
      const product = byId.get(id);
      if (!product) continue;
      const best = discounts
        .filter((d) => d.productIds.includes(id))
        .sort(
          (a, b) => discountAmount(b, product.price) - discountAmount(a, product.price),
        )[0];
      if (!best) continue;
      // The saving can never exceed the price. A fixed discount larger than the product would
      // otherwise render as a negative price on the storefront.
      const amount = Math.min(discountAmount(best, product.price), product.price);
      deals.push({
        product,
        label:
          best.type === "PERCENT"
            ? `${toFaDigits(Math.round(best.value))}٪`
            : formatToman(best.value),
        discountedPrice: Math.round(product.price - amount),
        endsAt: best.endsAt ? best.endsAt.toISOString() : null,
      });
    }
    return deals.slice(0, limit);
  }
}

/** The saving a discount represents, in Toman, honouring the percentage cap. */
function discountAmount(
  discount: { type: string; value: number; maxAmount: number | null },
  price: number,
): number {
  if (discount.type === "PERCENT") {
    const raw = (price * discount.value) / 100;
    return discount.maxAmount != null ? Math.min(raw, discount.maxAmount) : raw;
  }
  return discount.value;
}

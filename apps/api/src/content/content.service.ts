import { formatToman, toFaDigits } from "@kmodern/schema/format";
import type { LinkRef } from "@kmodern/schema";
import { Inject, Injectable } from "@nestjs/common";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { createPrismaClient } from "../prisma/client.js";
import { resolveLinks } from "./links.js";
import type {
  BlockData,
  ComparisonTable,
  HomeCategoryTile,
  HomeDeal,
  HomePost,
  HomeProduct,
  ResolvedBlock,
  ResolvedLink,
} from "./dto/home.dto.js";

type Db = ReturnType<typeof createPrismaClient>;

/** A product block's `props.source`, narrowed to the two kinds that actually filter. */
type ProductSource =
  | { kind: "ALL" }
  | { kind: "CATEGORY"; categoryId: string }
  | { kind: "COLLECTION"; collectionId: string };

/** Every block on the page that wants this one source, and the largest size any of them asked for. */
type ProductSourceEntry = {
  source: ProductSource;
  max: number;
  needs: { id: string; limit: number }[];
};

// Props arrive as untyped JSON out of the CMS `Page` row, so every read is defensive. A block that
// fails to parse still renders; it just renders without data. The alternative — rejecting the page —
// would let one malformed block take a shopper's home page down.
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

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

  /** As `publishedPage`, plus the title the page's own heading renders. */
  async publishedPageWithTitle(
    slug: string,
  ): Promise<{ slug: string; title: string; publishedBlocks: unknown } | null> {
    const page = await this.db.page.findUnique({
      where: { slug, status: "PUBLISHED" },
      select: { slug: true, title: true, publishedBlocks: true },
    });
    return page;
  }

  async publishedProducts(opts: {
    limit: number;
    categoryId?: string;
    collectionId?: string;
  }): Promise<HomeProduct[]> {
    // A category filter covers the whole two-level subtree, which is the rule the storefront
    // applied inline. Moving it here rather than dropping it is the point of the move: the client
    // no longer has to know how deep the category tree is.
    let categoryIds: string[] | undefined;
    if (opts.categoryId) {
      const children = await this.db.category.findMany({
        where: { parentId: opts.categoryId },
        select: { id: true },
      });
      categoryIds = [opts.categoryId, ...children.map((c) => c.id)];
    }

    const products = await this.db.product.findMany({
      where: {
        status: "PUBLISHED",
        ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
        ...(opts.collectionId
          ? { collectionItems: { some: { collectionId: opts.collectionId } } }
          : {}),
      },
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
      take: opts.limit,
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

  async publishedPosts(limit: number): Promise<HomePost[]> {
    const posts = await this.db.post.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishAt: { sort: "desc", nulls: "last" } },
      select: { id: true, slug: true, title: true, excerpt: true },
      take: limit,
    });
    return posts;
  }

  /**
   * Special offers: active automatic discounts inside their window.
   *
   * Coupon-only codes are deliberately excluded. They are not a storefront section, and advertising
   * a code nobody can see is noise.
   *
   * A Discount names its products in a scalar `productIds` array rather than a relation, so there
   * is nothing to join: the discounts are read first, the products they name are read second, and the
   * two are joined here. The best discount per product wins, and the cap on a percentage
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

    const products = (await this.publishedProducts({ limit: 100 })).filter((p) =>
      productIds.includes(p.id),
    );
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

  /**
   * Attach to every block the data it needs, so a client can render without reading anything.
   *
   * A CMS page is a heterogeneous list of blocks, six of which reach into the catalogue when they
   * render. Resolving them one block at a time would be an N+1 in the gateway instead of in the
   * client — the same defect, moved across the wire. So the whole page is scanned once, the
   * requirements are collected, identical requirements are folded together, and each is read at the
   * largest size any block asked for. The query count is then a function of how many *distinct*
   * sources the page names, not of how many blocks it has.
   */
  async resolveBlocks(raw: unknown): Promise<ResolvedBlock[]> {
    const blocks = list(raw)
      .map((entry) => obj(entry))
      .filter((b) => typeof b.id === "string" && typeof b.type === "string")
      .map((b) => ({
        id: b.id as string,
        type: b.type as string,
        props: obj(b.props),
      }));

    // --- collect every block's requirements, folding identical ones together ---
    const productSources = new Map<string, ProductSourceEntry>();
    const postNeeds: { id: string; limit: number }[] = [];
    const dealNeeds: { id: string; limit: number }[] = [];
    const comparisonNeeds: { id: string; productIds: string[] }[] = [];
    const categoryIds: string[] = [];
    /**
     * Each block's link refs, in the order its own branch expects to read them back. Batched into
     * one resolution below, because a `findUnique` per ref would make a page with a dozen linked
     * banners a dozen round trips — the N+1 this whole response shape exists to avoid, just moved
     * to the other side of the wire.
     */
    const linkPlan = new Map<string, (LinkRef | undefined | null)[]>();

    const noteSource = (blockId: string, source: ProductSource, limit: number) => {
      const key =
        source.kind === "CATEGORY"
          ? `CATEGORY:${source.categoryId}`
          : source.kind === "COLLECTION"
            ? `COLLECTION:${source.collectionId}`
            : "ALL";
      const entry = productSources.get(key) ?? { source, max: 0, needs: [] };
      entry.max = Math.max(entry.max, limit);
      entry.needs.push({ id: blockId, limit });
      productSources.set(key, entry);
    };

    for (const block of blocks) {
      const p = block.props;
      switch (block.type) {
        case "hero": {
          // The hero's own configured image wins; the catalogue is only a fallback, so one product
          // is enough and the block decides whether to use it.
          noteSource(block.id, { kind: "ALL" }, 1);
          linkPlan.set(block.id, [obj(p.cta).link as LinkRef | undefined]);
          break;
        }
        case "productGrid": {
          const limit = Math.min(num(p.limit) ?? 4, 8);
          noteSource(block.id, productSourceOf(p.source), limit);
          break;
        }
        case "productSlider": {
          const limit = Math.min(num(p.limit) ?? 8, 12);
          noteSource(block.id, productSourceOf(p.source), limit);
          break;
        }
        case "categoryTiles": {
          for (const entry of list(p.categories)) {
            const id = str(obj(entry).categoryId);
            if (id) categoryIds.push(id);
          }
          break;
        }
        case "banner":
        case "bannerPair":
        case "bannerTrio": {
          linkPlan.set(
            block.id,
            bannersOf(block.type, p).map((banner) => obj(banner.image).link as LinkRef | undefined),
          );
          break;
        }
        case "countdown": {
          linkPlan.set(block.id, [p.link as LinkRef | undefined]);
          break;
        }
        case "beforeAfter": {
          linkPlan.set(block.id, [
            obj(p.before).link as LinkRef | undefined,
            obj(p.after).link as LinkRef | undefined,
          ]);
          break;
        }
        case "blogTeaser": {
          postNeeds.push({ id: block.id, limit: num(p.limit) ?? 3 });
          break;
        }
        case "dealGrid": {
          dealNeeds.push({ id: block.id, limit: num(p.limit) ?? 6 });
          break;
        }
        case "comparisonTable": {
          const ids = list(p.productIds).map(str).filter((v): v is string => Boolean(v));
          if (ids.length >= 2) comparisonNeeds.push({ id: block.id, productIds: ids });
          break;
        }
        default:
          // Every remaining block type renders from its own props alone.
          break;
      }
    }

    // Every block's refs, flattened in block order, so one batched call covers the whole page and
    // the walk below can hand each block its own slice back by cursor.
    const flatRefs: (LinkRef | undefined | null)[] = [];
    for (const block of blocks) {
      for (const ref of linkPlan.get(block.id) ?? []) flatRefs.push(ref);
    }

    // --- read each distinct requirement once ---
    //
    // The tuple type is written out because a heterogeneous `Promise.all` array literal infers as
    // a union of its element types, which silently widens every destructured name to that union.
    const [
      sourceProducts,
      posts,
      deals,
      tiles,
      links,
      comparisons,
    ]: [
      { entry: ProductSourceEntry; products: HomeProduct[] }[],
      HomePost[],
      HomeDeal[],
      Map<string, HomeCategoryTile>,
      (ResolvedLink | null)[],
      (ComparisonTable | null)[],
    ] = await Promise.all([
      Promise.all(
        [...productSources.values()].map(async (entry) => ({
          entry,
          products: await this.publishedProducts({
            limit: entry.max,
            ...(entry.source.kind === "CATEGORY"
              ? { categoryId: entry.source.categoryId }
              : {}),
            ...(entry.source.kind === "COLLECTION"
              ? { collectionId: entry.source.collectionId }
              : {}),
          }),
        })),
      ),
      postNeeds.length === 0
        ? Promise.resolve<HomePost[]>([])
        : this.publishedPosts(Math.max(...postNeeds.map((n) => n.limit))),
      dealNeeds.length === 0
        ? Promise.resolve<HomeDeal[]>([])
        : this.activeDeals(Math.max(...dealNeeds.map((n) => n.limit))),
      categoryIds.length === 0
        ? Promise.resolve(new Map<string, HomeCategoryTile>())
        : this.categoryTiles([...new Set(categoryIds)]),
      resolveLinks(this.db, flatRefs),
      this.comparisonTables(comparisonNeeds.map((n) => n.productIds)),
    ]);

    const productsByBlock = new Map<string, { source: ProductSource; products: HomeProduct[] }[]>();
    for (const { entry, products } of sourceProducts) {
      for (const need of entry.needs) {
        const bucket = productsByBlock.get(need.id) ?? [];
        bucket.push({ source: entry.source, products: products.slice(0, need.limit) });
        productsByBlock.set(need.id, bucket);
      }
    }
    const comparisonById = new Map<string, ComparisonTable>();
    comparisonNeeds.forEach((need, index) => {
      const table = comparisons[index];
      if (table) comparisonById.set(need.id, table);
    });

    // --- zip the data back onto the blocks ---
    let linkCursor = 0;
    return blocks.map((block) => {
      const data: BlockData = {};
      const p = block.props;
      // This block's own slice of the one batched link resolution, in the order its branch reads it.
      const mine = (linkPlan.get(block.id) ?? []).map(() => links[linkCursor++]);

      switch (block.type) {
        case "hero": {
          const bucket = productsByBlock.get(block.id);
          if (bucket?.[0]) data.product = bucket[0].products[0] ?? null;
          if (mine[0]) data.cta = mine[0];
          break;
        }
        case "productGrid":
        case "productSlider": {
          const bucket = productsByBlock.get(block.id);
          if (bucket) data.products = bucket[0]?.products ?? [];
          break;
        }
        case "countdown": {
          if (mine[0]) data.link = mine[0];
          break;
        }
        case "beforeAfter": {
          data.pairLinks = mine;
          break;
        }
        case "categoryTiles": {
          const byId = tiles;
          // One tile per entry in props.categories, always — the renderer zips this array against
          // props.categories by index to reach each entry's image. An earlier version filtered the
          // unusable ids out first, which quietly shortened the array and shifted every later tile
          // onto the wrong photograph. A missing id yields a placeholder in place instead, so the
          // two stay the same length whatever the row contains. Props reach the renderer as stored,
          // not re-validated, so "the schema requires it" is not a guarantee here.
          data.tiles = list(p.categories).map(
            (entry) => byId.get(str(obj(entry).categoryId) ?? "") ?? { href: "/", name: "دسته" },
          );
          break;
        }
        case "banner":
        case "bannerPair":
        case "bannerTrio": {
          data.links = mine;
          break;
        }
        case "blogTeaser": {
          const need = postNeeds.find((n) => n.id === block.id);
          data.posts = need ? posts.slice(0, need.limit) : [];
          break;
        }
        case "dealGrid": {
          const need = dealNeeds.find((n) => n.id === block.id);
          data.deals = need ? deals.slice(0, need.limit) : [];
          break;
        }
        case "comparisonTable": {
          const table = comparisonById.get(block.id);
          if (table) data.comparison = table;
          break;
        }
        default:
          break;
      }

      return { id: block.id, type: block.type, props: p, data };
    });
  }

  private async categoryTiles(ids: string[]): Promise<Map<string, HomeCategoryTile>> {
    const rows = await this.db.category.findMany({
      where: { id: { in: ids } },
      select: { id: true, slug: true, name: true },
    });
    return new Map(
      rows.map((row) => [row.id, { href: `/category/${row.slug}`, name: row.name }]),
    );
  }

  /**
   * One query per distinct product-id set, results shared between the blocks that asked for it.
   *
   * The column order is the order the database returns, not the order the admin listed the ids in.
   * That is a faithful move of what the client did; whether the admin's order should win is a
   * question for the catalogue slice, not something to change inside a move.
   */
  private async comparisonTables(idSets: string[][]): Promise<(ComparisonTable | null)[]> {
    const allIds = [...new Set(idSets.flat())];
    if (allIds.length === 0) return idSets.map(() => null);

    const products = await this.db.product.findMany({
      where: { id: { in: allIds }, status: "PUBLISHED" },
      select: { id: true, name: true },
    });
    const specValues = await this.db.productSpecValue.findMany({
      where: { productId: { in: products.map((p) => p.id) } },
      select: { productId: true, value: true, specField: { select: { name: true } } },
    });

    return idSets.map((ids) => {
      const columns = products.filter((p) => ids.includes(p.id));
      // Fewer than two columns is not a comparison, and the client used to drop the block.
      if (columns.length < 2) return null;
      const fieldNames = [...new Set(specValues.map((sv) => sv.specField.name))];
      return {
        products: columns.map((p) => ({ id: p.id, name: p.name })),
        fields: fieldNames.map((name) => ({
          name,
          values: columns.map((column) => {
            const hit = specValues.find(
              (sv) => sv.productId === column.id && sv.specField.name === name,
            );
            return hit?.value ?? "—";
          }),
        })),
      };
    });
  }
}

function productSourceOf(source: unknown): ProductSource {
  const s = obj(source);
  if (s.kind === "CATEGORY") {
    const id = str(s.categoryId);
    return id ? { kind: "CATEGORY", categoryId: id } : { kind: "ALL" };
  }
  if (s.kind === "COLLECTION") {
    const id = str(s.collectionId);
    return id ? { kind: "COLLECTION", collectionId: id } : { kind: "ALL" };
  }
  return { kind: "ALL" };
}

/** `banner` carries one banner inline; the pair and trio forms carry an array. */
function bannersOf(type: string, props: Record<string, unknown>): Record<string, unknown>[] {
  if (type !== "banner") return list(props.banners).map(obj);
  return [props];
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

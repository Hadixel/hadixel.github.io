// What a logged-out visitor is allowed to see of the shop's catalogue.
//
// Six reads the storefront used to write for itself: four query helpers in one file, and two
// `findUnique`s that sat in a page beside the JSX they fed. Each was a `where` written next to the
// markup that depended on it, and a `status` clause away from publishing a draft. Three rules moved
// here with them, and each is here because a client cannot be given it:
//
//   1. Only `PUBLISHED` products, and only variants that are sellable (in stock, or backorderable).
//      A draft on a public route is the kind of bug that is invisible in review and obvious to the
//      shopper who finds it, and it used to be one `status` clause away in four different files.
//   2. A category filter covers the whole two-level subtree. The client no longer knows how deep the
//      tree is, which is the point: a third level is a gateway change and not a storefront one.
//   3. A product card's price is the smallest and largest *sellable* variant. A sold-out cheap
//      variant must not advertise a price nobody can buy at, and two clients computing that from the
//      same variant list is how they come to disagree.
//
// The shapes are the storefront's, not the schema's: each read answers one question a JSX asks, and
// a client that has to unpack a row is a client that can unpack it wrongly.

import { Inject, Injectable } from "@nestjs/common";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import {
  CATALOGUE_PAGE_SIZE,
  COLLECTION_PREVIEW_SIZE,
  CatalogueSortDto,
  type CatalogueCollection,
  type CatalogueProduct,
  type CatalogueProductDetail,
  type CategoryNode,
  type CategorySummary,
  type CategoryTreeResponse,
  type CollectionSummary,
} from "./dto/catalogue.dto.js";

/**
 * The columns a product card draws, and the variants it may price itself from.
 *
 * Sellable only, and cheapest first so `variants[0]` is both the image a card shows and the low end
 * of the range. One declaration rather than two: the listing, the collection preview and the product
 * page's related row all price a product the same way, and three copies of that `where` is three
 * chances for one of them to quietly stop filtering.
 */
const cardInclude = {
  category: { select: { id: true, name: true, slug: true } },
  variants: {
    where: { OR: [{ stock: { gt: 0 } }, { allowBackorder: true }] },
    orderBy: { price: "asc" },
    select: { id: true, colorName: true, colorCode: true, images: true, price: true },
  },
} satisfies Prisma.ProductInclude;

type CardRow = Prisma.ProductGetPayload<{ include: typeof cardInclude }>;

/**
 * The four columns a navigation draws a category from, and nothing else.
 *
 * The storefront's sidebar and filter render an id, a name, a slug and a parent, so a category row
 * that also carried its weight, its SEO blob and its sort position was three columns wider than any
 * of them could use — on a public route.
 */
const categoryColumns = {
  id: true,
  name: true,
  slug: true,
  parentId: true,
} satisfies Prisma.CategorySelect;

/** What a collection page's own heading needs, and nothing more. */
const collectionColumns = { id: true, name: true, slug: true } satisfies Prisma.CollectionSelect;

/**
 * A collection's members, in the collection's own order and capped at eight.
 *
 * The draft filter is on the *item* rather than on the product it points at, and that is not a
 * stylistic choice: this Prisma cannot filter a to-one relation inside an `include`, so the only
 * place a member's status can be filtered without reading the whole collection is the item's own
 * `where`. It also gets the cap right — the eight are eight *published* members, not the first eight
 * rows of which some turned out to be drafts.
 */
const collectionSelect = {
  ...collectionColumns,
  items: {
    where: { product: { is: { status: "PUBLISHED" } } },
    orderBy: { sortOrder: "asc" },
    take: COLLECTION_PREVIEW_SIZE,
    include: { product: { include: cardInclude } },
  },
} satisfies Prisma.CollectionSelect;

type CollectionRow = Prisma.CollectionGetPayload<{ select: typeof collectionSelect }>;

@Injectable()
export class CatalogueService {
  constructor(@Inject(DATA_CLIENT) private readonly db: PrismaClient) {}

  /**
   * The category tree, in both the shapes the storefront's navigation draws it in.
   *
   * `roots` is nested and `all` is flat because two renderers want two things: the sidebar walks the
   * tree, and the mobile filter groups a flat list by `parentId` rather than nesting it. Both were
   * assembled in the storefront from one `findMany`, and the order is the operator's own — by
   * `sortOrder`, then by name — because a category dragged to the top of the panel must stay at the
   * top of the shop.
   */
  async categoryTree(): Promise<CategoryTreeResponse> {
    const all = await this.db.category.findMany({
      select: categoryColumns,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return {
      roots: all
        .filter((category) => !category.parentId)
        .map((root) => ({
          ...root,
          children: all
            .filter((child) => child.parentId === root.id)
            .map((child) => ({ ...child, children: [] as CategoryNode[] })),
        })),
      all,
    };
  }

  /** A category by slug, or null when there is no such category. */
  async categoryBySlug(slug: string): Promise<CategorySummary | null> {
    return this.db.category.findUnique({ where: { slug }, select: categoryColumns });
  }

  /**
   * The collections, each with the products a shopper sees on it.
   *
   * The eight-member cap and the collection's own member order are the storefront's decisions, kept
   * rather than re-made. What is not kept is the shape of a member: the storefront fetched a
   * collection's products whole, draft status included, so a collection could publish a product an
   * operator has not finished. A member is now the same card every other product read answers with,
   * and the cap counts published members.
   */
  async collections(): Promise<CatalogueCollection[]> {
    const rows: CollectionRow[] = await this.db.collection.findMany({
      orderBy: { sortOrder: "asc" },
      select: collectionSelect,
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      items: row.items.map((item) => this.toCard(item.product)),
    }));
  }

  /** A collection by slug, or null when there is no such collection. */
  async collectionBySlug(slug: string): Promise<CollectionSummary | null> {
    return this.db.collection.findUnique({ where: { slug }, select: collectionColumns });
  }

  /**
   * The published products a listing draws, filtered the way a listing filters.
   *
   * `categoryId` covers the category and its children, `collectionId` is membership rather than
   * authorship — a product in a collection is still filed under the category it belongs to — and
   * `search` matches the three fields a shopper would recognise a product by.
   *
   * The price sorts are done in memory, and the reason is a limitation rather than a preference:
   * Prisma cannot order by an aggregate over a relation, so "cheapest variant" is not something the
   * query can sort on. A wider window is read and trimmed, because the alternative is a page whose
   * cheapest is only cheapest among the first `limit` rows.
   */
  async publishedProducts(opts: {
    categoryId?: string;
    collectionId?: string;
    search?: string;
    limit?: number;
    sort?: CatalogueSortDto;
  }): Promise<CatalogueProduct[]> {
    const limit = opts.limit ?? CATALOGUE_PAGE_SIZE;

    let categoryIds: string[] | undefined;
    if (opts.categoryId) {
      const children = await this.db.category.findMany({
        where: { parentId: opts.categoryId },
        select: { id: true },
      });
      categoryIds = [opts.categoryId, ...children.map((child) => child.id)];
    }

    const priceSort =
      opts.sort === CatalogueSortDto.PriceAsc || opts.sort === CatalogueSortDto.PriceDesc;

    const products = await this.db.product.findMany({
      where: {
        status: "PUBLISHED",
        ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
        ...(opts.collectionId
          ? { collectionItems: { some: { collectionId: opts.collectionId } } }
          : {}),
        ...(opts.search
          ? {
              OR: [
                { name: { contains: opts.search, mode: "insensitive" } },
                { brand: { contains: opts.search, mode: "insensitive" } },
                { model: { contains: opts.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: cardInclude,
      take: priceSort ? Math.max(limit, 200) : limit,
    });

    const cards = products.map((product) => this.toCard(product));
    if (opts.sort === CatalogueSortDto.PriceAsc) cards.sort((a, b) => a.price - b.price);
    if (opts.sort === CatalogueSortDto.PriceDesc) cards.sort((a, b) => b.price - a.price);
    return priceSort ? cards.slice(0, limit) : cards;
  }

  /**
   * A published product by slug, with everything its own page draws.
   *
   * Absent and unpublished are one answer — null, and a 404 at the route — because to a shopper they
   * are the same thing, and because a storefront that renders a draft is a storefront no amount of
   * care in the panel can keep unpublished.
   *
   * Every variant, not only the sellable ones, because a product page that hides a sold-out colour
   * cannot say it is sold out. A declared specification travels with its field's name, since the
   * page renders a `name`/`value` pair per row and must not fetch a field to label one.
   */
  async productBySlug(slug: string): Promise<CatalogueProductDetail | null> {
    const row = await this.db.product.findFirst({
      where: { slug, status: "PUBLISHED" },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        variants: {
          orderBy: [{ colorName: "asc" }, { price: "asc" }],
          select: {
            id: true,
            colorName: true,
            colorCode: true,
            price: true,
            stock: true,
            reserved: true,
            allowBackorder: true,
            images: true,
            sku: true,
          },
        },
        specValues: { include: { specField: { select: { name: true } } } },
      },
    });
    if (!row) return null;

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      brand: row.brand,
      model: row.model,
      description: row.description,
      features: row.features,
      categoryId: row.categoryId,
      category: row.category,
      variants: row.variants.map((variant) => ({
        ...variant,
        available: variant.allowBackorder || variant.stock - variant.reserved > 0,
      })),
      specValues: row.specValues.map((specValue) => ({
        specFieldId: specValue.specFieldId,
        value: specValue.value,
        specField: specValue.specField,
      })),
    };
  }

  /**
   * A product row as a card draws it.
   *
   * The one place a product's price and availability are decided, shared by the listing, the
   * collection preview and the product page's related row. A product with no sellable variant is
   * `available: false` rather than absent: it is a published product with nothing to buy today, and
   * hiding it would make a category look empty for a reason the shopper cannot see.
   */
  private toCard(row: CardRow): CatalogueProduct {
    const prices = row.variants.map((variant) => variant.price);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      brand: row.brand,
      model: row.model,
      category: row.category,
      price: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
      available: row.variants.length > 0,
      image: row.variants[0]?.images[0] ?? null,
      variantCount: row.variants.length,
      dots: row.variants.map((variant) => ({
        id: variant.id,
        colorName: variant.colorName,
        colorCode: variant.colorCode,
        images: variant.images,
        price: variant.price,
      })),
    };
  }
}

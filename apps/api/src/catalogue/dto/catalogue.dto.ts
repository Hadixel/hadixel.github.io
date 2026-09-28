// What the gateway accepts about the catalogue, and the shapes it answers with.
//
// The inbound DTOs are classes because the global validation pipe reflects over the instance; the
// outbound shapes are plain types because nothing validates a response. Each response type is the
// shape a storefront JSX needs, not a table's columns: a product card draws a price range, an
// availability flag and colour dots, and a client that had to compute those from raw rows is a client
// that can compute them wrongly.

import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";

/** How many products a catalogue read answers with when the caller does not say. */
export const CATALOGUE_PAGE_SIZE = 48;

/**
 * The most products one of these reads will serve.
 *
 * Bounded rather than trusted, for the same reason the home read is: a caller that picks its own
 * ceiling is not being served, it is setting the gateway's memory limit. The storefront's listings ask
 * for 60 and the home page blocks for 4 to 8.
 */
export const MAX_CATALOGUE_PAGE_SIZE = 100;

/**
 * How many products a collection carries.
 *
 * Carried over from the storefront's own collection read, which took the first eight members in the
 * collection's own order. The cap is the decision, not an accident of the query.
 */
export const COLLECTION_PREVIEW_SIZE = 8;

/** The orders the catalogue will sort a product list by. */
export enum CatalogueSortDto {
  Newest = "newest",
  PriceAsc = "price-asc",
  PriceDesc = "price-desc",
}

/**
 * A cuid, as an opaque handle.
 *
 * Bound rather than trusted: a product or collection id arrives in a query string, and a value that
 * cannot be an id is a probe rather than a request. The alphabet is the one cuids are written in, so
 * this refuses a path or an operator without refusing a real id.
 */
const HANDLE = /^[a-z0-9]{1,64}$/i;

/**
 * The product list's filters.
 *
 * Every field optional, because the plain product listing is the common case and needs none of them.
 * There is no status field: a shopper may not ask for a draft, and a read that offered the choice
 * would be a read whose rule is the caller's.
 */
export class CatalogueProductQueryDto {
  /** A category and its children. */
  @IsOptional()
  @IsString({ message: "شناسه دسته باید متن باشد." })
  @Matches(HANDLE, { message: "شناسه دسته معتبر نیست." })
  categoryId?: string;

  @IsOptional()
  @IsString({ message: "شناسه کلکسیون باید متن باشد." })
  @Matches(HANDLE, { message: "شناسه کلکسیون معتبر نیست." })
  collectionId?: string;

  /**
   * What the shopper typed.
   *
   * Length-bounded and not pattern-bounded, because it feeds a `contains` over a product name, brand
   * and model, which are text in two scripts and have no single character class.
   */
  @IsOptional()
  @IsString({ message: "عبارت جست‌وجو باید متن باشد." })
  @Length(1, 200, { message: "عبارت جست‌وجو بیش از حد طولانی است." })
  search?: string;

  @IsOptional()
  @IsEnum(CatalogueSortDto, { message: "ترتیب نمایش معتبر نیست." })
  sort?: CatalogueSortDto;

  @IsOptional()
  @IsInt({ message: "تعداد محصولات باید عدد صحیح باشد." })
  @Min(1, { message: "تعداد محصولات باید بزرگ‌تر از صفر باشد." })
  @Max(MAX_CATALOGUE_PAGE_SIZE, { message: "تعداد محصولات بیش از حد مجاز است." })
  @Type(() => Number)
  limit: number = CATALOGUE_PAGE_SIZE;
}

/**
 * The slug identifying a category, a collection or a product.
 *
 * One class for all three rather than three copies of one regex: they are the same segment of the
 * same kind of route, and a bound that drifts between them is a bound one of the three does not have.
 */
export class SlugParamDto {
  @Matches(/^[a-z0-9][a-z0-9-]{0,79}$/i, { message: "شناسه معتبر نیست." })
  slug!: string;
}

/* ---------- the shapes these reads answer with ---------- */

/**
 * One category, as the sidebar and the mobile filter draw it.
 *
 * Four columns, and the four are the ones a link in a navigation renders: the row's own id and name,
 * the slug it is linked by, and the parent the tree is assembled from. The gateway carries no weight,
 * no SEO blob and no sort order, because nothing on the storefront renders them.
 */
export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

/** A category with its children, for a tree the client renders as a tree. */
export interface CategoryNode extends CategorySummary {
  children: CategoryNode[];
}

/**
 * The whole catalogue tree, as two answers to two questions.
 *
 * `roots` is the nested shape for a renderer that walks the tree; `all` is the flat list for the
 * filter that groups it by `parentId` instead. Both existed on the storefront, so both are here
 * rather than making one of the two callers rebuild the other.
 */
export interface CategoryTreeResponse {
  roots: CategoryNode[];
  all: CategorySummary[];
}

/** A colour dot: the per-variant imagery a card swaps through, and the price it is at. */
export interface CatalogueVariantDot {
  id: string;
  colorName: string;
  colorCode: string | null;
  images: string[];
  price: number;
}

/**
 * A product as a card and a listing row draw it.
 *
 * The price is the smallest and largest *sellable* variant and `available` says whether any variant
 * is sellable at all. Both were computed by the storefront from a variant list the gateway sent in
 * full; they are computed here, so a client cannot price a product from a sold-out variant and no
 * two clients can disagree about what a product costs.
 */
export interface CatalogueProduct {
  id: string;
  slug: string;
  name: string;
  brand: string;
  model: string;
  category: { id: string; name: string; slug: string };
  price: number;
  maxPrice: number;
  available: boolean;
  image: string | null;
  variantCount: number;
  dots: CatalogueVariantDot[];
}

/** A collection and the products a shopper sees on it. */
export interface CatalogueCollection {
  id: string;
  name: string;
  slug: string;
  items: CatalogueProduct[];
}

/** A collection by slug, for the page whose title it is. */
export interface CollectionSummary {
  id: string;
  name: string;
  slug: string;
}

/**
 * One declared specification of a product, with the value this product gives it.
 *
 * The field's name travels with the value rather than as a second lookup: the page renders a
 * `name`/`value` pair, and a page that had to fetch the field to label a row is a page holding a
 * data connection while it renders.
 */
export interface CatalogueSpecValue {
  specFieldId: string;
  value: string;
  specField: { name: string };
}

/**
 * One variant on a product page: the buy box's own row.
 *
 * Every variant, not only the sellable ones, because a page that hides a sold-out colour cannot say
 * it is sold out. `available` is derived rather than shipped as three columns to be combined at the
 * call site, and it is derived here for the reason the card's own `available` is.
 */
export interface CatalogueDetailVariant {
  id: string;
  colorName: string;
  colorCode: string | null;
  price: number;
  stock: number;
  reserved: number;
  allowBackorder: boolean;
  /**
   * Whether this variant can be bought at all.
   *
   * "In stock, or orderable on backorder" is the shop's rule about its own stock, and a buy box and a
   * card that each decide it for themselves is how one of them ends up offering a variant the other
   * has already marked unavailable.
   */
  available: boolean;
  images: string[];
  sku: string;
}

/**
 * A product as its own page draws it.
 *
 * Different from `CatalogueProduct` because the questions are different: a card asks what a product
 * costs, and this page asks what it *is* — its description, every variant it has, its declared
 * specifications, and the category it is filed under.
 */
export interface CatalogueProductDetail {
  id: string;
  slug: string;
  name: string;
  brand: string;
  model: string;
  description: string | null;
  features: string[];
  categoryId: string;
  category: { id: string; name: string; slug: string };
  variants: CatalogueDetailVariant[];
  specValues: CatalogueSpecValue[];
}

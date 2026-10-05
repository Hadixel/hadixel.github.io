import { Type } from "class-transformer";
import { IsInt, IsOptional, Matches, Max, Min } from "class-validator";

/**
 * The query the storefront's home page sends.
 *
 * A class, not an interface, because the global validation pipe validates the *instance* and the
 * DTO is what `forbidNonWhitelisted` reads to decide which keys are known. An interface erases at
 * runtime, and the pipe would then either reject every field as unknown or accept everything.
 *
 * Every field is bounded rather than trusted, so one caller cannot ask the gateway to read the
 * whole catalogue into memory. `limit` is the number of products, `dealsLimit` the number of offers.
 */
export class HomeQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  @Type(() => Number)
  limit: number = 24;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24)
  @Type(() => Number)
  dealsLimit: number = 6;
}

/**
 * The slug identifying a CMS page.
 *
 * A class rather than a bare `@Param("slug")` string for the same reason `HomeQueryDto` is one: the
 * global pipe validates the instance, and an unvalidated path segment is the one piece of a request
 * a caller fully controls. The bound is deliberately tight — a slug is a slug, and a long or
 * control-character-bearing value is a probe, not a page.
 */
export class PageSlugParamDto {
  @Matches(/^[a-z0-9][a-z0-9-]{0,79}$/i, { message: "شناسه صفحه معتبر نیست." })
  slug!: string;
}

/**
 * Response shapes are plain types, not classes.
 *
 * Only an inbound DTO has to be a class, because the validation pipe reflects over the instance at
 * runtime. An outbound shape is only ever serialised, so a class would add property-initialiser
 * noise and a false claim that something validates it. Nothing validates a response.
 */
export interface HomeVariant {
  id: string;
  colorName: string;
  colorCode: string | null;
  images: string[];
  price: number;
}

export interface HomeProduct {
  id: string;
  slug: string;
  name: string;
  brand: string;
  model: string;
  category: { id: string; name: string; slug: string };
  price: number;
  maxPrice: number;
  discount: { label: string; discountedPrice: number; endsAt: string | null } | null;
  available: boolean;
  image: string | null;
  variantCount: number;
  dots: HomeVariant[];
}

export interface HomeDeal {
  product: HomeProduct;
  label: string;
  discountedPrice: number;
  endsAt: string | null;
}

export interface HomePost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
}

export interface HomeCategoryTile {
  href: string;
  name: string;
}

/** A link the gateway has already turned into an href, so the client never resolves one itself. */
export interface ResolvedLink {
  href: string;
  newTab: boolean;
}

/**
 * The comparison table, flattened for rendering.
 *
 * `fields[i].values` is aligned by index with `products`, rather than keyed by product id: a table
 * renders one row per field and walks the products left to right, so an array saves the renderer a
 * lookup per cell and cannot be mis-keyed.
 */
export interface ComparisonTable {
  products: { id: string; name: string }[];
  fields: { name: string; values: string[] }[];
}

/**
 * What one block needs from the database, resolved for it.
 *
 * Every field is optional rather than a discriminated union per block type. A CMS page holds a
 * heterogeneous list of blocks whose props are stored as untyped JSON, so a per-type union would
 * force every consumer to narrow on a tag the wire format does not carry. The gateway is the only
 * producer, and the content suite pins which field each block type populates.
 */
export interface BlockData {
  /** `hero`: the product whose image stands in when the block configures none. */
  product?: HomeProduct | null;
  /** `hero`: the call-to-action, already resolved. */
  cta?: ResolvedLink | null;
  /** `countdown`: the timer's link, already resolved. */
  link?: ResolvedLink | null;
  /** `productGrid`, `productSlider`: published products, already filtered and capped. */
  products?: HomeProduct[];
  /** `dealGrid`: active automatic discounts. */
  deals?: HomeDeal[];
  /** `categoryTiles`: aligned by index with `props.categories`. */
  tiles?: HomeCategoryTile[];
  /** `banner`, `bannerPair`, `bannerTrio`: aligned by index with the banners. */
  links?: (ResolvedLink | null)[];
  /** `beforeAfter`: aligned by index with `[before, after]`. */
  pairLinks?: (ResolvedLink | null)[];
  /** `blogTeaser`: published posts, newest first. */
  posts?: HomePost[];
  /** `comparisonTable`: the columns and the spec rows. */
  comparison?: ComparisonTable;
}

/**
 * A block with its data attached.
 *
 * The data travels on the block rather than in a parallel map keyed by block id: a map needs both
 * sides to agree on the key, and a block that arrives without its data is then a missing entry
 * rather than an obviously empty one.
 */
export interface ResolvedBlock {
  id: string;
  type: string;
  props: Record<string, unknown>;
  data: BlockData;
}

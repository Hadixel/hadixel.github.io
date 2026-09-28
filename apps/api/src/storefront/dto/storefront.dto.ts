import { Type } from "class-transformer";
import { IsInt, IsOptional, Matches, Max, Min } from "class-validator";

/**
 * What the storefront's public reads accept and hand back.
 *
 * Only the two inbound shapes are classes, for the reason `content/dto/home.dto.ts` gives: the global
 * pipe validates the instance, and an interface erases at runtime. Everything below the classes is an
 * outbound type, which is only ever serialised.
 */

/** How many posts the blog index asks for. Bounded, like every other list in the gateway. */
export class PostListQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  @Type(() => Number)
  limit: number = 12;
}

/** The slug identifying one post. A slug is a slug, and nothing else is a post read. */
export class PostSlugParamDto {
  @Matches(/^[a-z0-9][a-z0-9-]{0,79}$/i, { message: "شناسه مطلب معتبر نیست." })
  slug!: string;
}

/* ---------- navigation ---------- */

/**
 * The two menu locations and the two display modes, as the storefront's chrome names them.
 *
 * Restated rather than imported from the data tier's generated enums, because a client that imported
 * an enum out of the data tier would be importing the data tier — the thing this whole move exists to
 * stop. The values are the same three words the menu table stores.
 */
export type NavLocation = "HEADER" | "FOOTER" | "MOBILE";
export type NavDisplay = "DROPDOWN" | "MEGA";

export interface NavPromo {
  imageUrl: string;
  alt: string;
  href: string;
  newTab: boolean;
  heading?: string;
  subtext?: string;
}

export interface NavNode {
  id: string;
  label: string;
  href: string;
  newTab: boolean;
  display: NavDisplay;
  children: NavNode[];
  promos: NavPromo[];
}

export interface NavMenu {
  location: NavLocation;
  name: string;
  tree: NavNode[];
}

export interface StorefrontNav {
  menus: NavMenu[];
}

/* ---------- the footer's link groups ---------- */

/**
 * One footer link, already a finished href.
 *
 * A category entry is one of these too, with the category's name as its label: the footer draws both
 * the same way, and a second shape for the same list is a translation the chrome would have to undo.
 */
export interface FooterLink {
  href: string;
  label: string;
}

export interface StorefrontFooter {
  /** The menu's own name, which titles the first group. Null when no footer menu is configured. */
  name: string | null;
  links: FooterLink[];
  categories: FooterLink[];
}

/* ---------- the blog ---------- */

export interface PostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  /** ISO 8601. A `Date` crosses JSON as a string, and the client formats it for the reader. */
  publishAt: string | null;
}

export interface PostDetail extends PostSummary {
  byline: string | null;
  /** The document with every product mention already resolved into a `productLink` node. */
  body: unknown;
}

export interface PostListRead {
  posts: PostSummary[];
}

/* ---------- the sitemap ---------- */

export type SitemapFrequency = "daily" | "weekly" | "monthly";

/**
 * One sitemap row, with the base left off.
 *
 * The public address is a build-time setting of the storefront's own deployment, so the gateway cannot
 * know it and must not guess one. What the gateway does know is which kind of page this is, and the
 * change frequency and priority follow from that — so they travel with the entry and the client is
 * left with the one thing only it can do, which is to prefix its own host.
 */
export interface SitemapEntry {
  path: string;
  lastModified: string | null;
  changeFrequency: SitemapFrequency;
  priority: number;
}

export interface SitemapRead {
  entries: SitemapEntry[];
  /**
   * False when a section could not be read, in which case `missing` names which ones.
   *
   * This field is the whole reason the read degrades instead of failing. A sitemap missing entries
   * is indistinguishable from a shop that stopped selling things, and it is read by machines that
   * never complain — so a short sitemap has to be able to say so out loud.
   */
  complete: boolean;
  missing: string[];
}

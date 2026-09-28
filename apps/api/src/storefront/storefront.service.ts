import { Inject, Injectable } from "@nestjs/common";
import { linkRefSchema, type LinkRef } from "@kmodern/schema";
import { normalizeLinkRef, resolveLinks } from "../content/links.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type {
  FooterLink,
  NavMenu,
  NavNode,
  NavPromo,
  PostDetail,
  PostSummary,
  SitemapEntry,
  SitemapRead,
  StorefrontFooter,
} from "./dto/storefront.dto.js";

type Db = PrismaClient;

/**
 * A whole menu, in one read.
 *
 * The storefront's header used to ask for one location and the footer for another, and each of those
 * five `findUnique` calls a link needed — a menu item's target, its children's, every promo's — was
 * one round trip the chrome paid per link. The tree assembly then happened in the component. So the
 * menu was a page that read the database while it rendered, and a page with eleven links issued
 * eleven queries to draw a row of labels.
 *
 * `include` here is the whole shape the storefront used to assemble by hand: visible items only, in
 * `sortOrder`, one level of children, their promos. The two levels are what the chrome renders, and a
 * third level would be a menu the operator can build but the storefront cannot draw.
 */
const MENU_INCLUDE = {
  items: {
    where: { visible: true },
    orderBy: { sortOrder: "asc" },
    include: {
      children: { where: { visible: true }, orderBy: { sortOrder: "asc" } },
      promos: { orderBy: { sortOrder: "asc" } },
    },
  },
} satisfies Prisma.MenuInclude;

type MenuRow = Prisma.MenuGetPayload<{ include: typeof MENU_INCLUDE }>;
type ItemRow = MenuRow["items"][number];

/** A product mention, resolved. What a `productCard` node becomes when its product still exists. */
interface ProductMention {
  name: string;
  href: string;
  image: string | null;
}

/**
 * How deep the body walk descends before it stops rewriting.
 *
 * A post body is authored through a block editor and is shallow by construction; a document nested
 * past this is not one, and a walk with no bound is a stack overflow waiting for an operator to paste
 * something strange. Past the bound the nodes are left exactly as they are, which renders as nothing
 * rather than as a failure.
 */
const MAX_BODY_DEPTH = 24;

/** The three routes that exist whether or not the shop has anything to list. */
const STATIC_SITEMAP: SitemapEntry[] = [
  { path: "", lastModified: null, changeFrequency: "daily", priority: 1 },
  { path: "/products", lastModified: null, changeFrequency: "daily", priority: 0.9 },
  { path: "/blog", lastModified: null, changeFrequency: "weekly", priority: 0.6 },
];

/**
 * The storefront's public reads: the chrome, the blog, and the sitemap.
 *
 * Every one of them is a shopper looking at a page with no session, so none of them checks an
 * identity — there is no operator behind a category list and no customer behind a sitemap. What they
 * all share is that each answers exactly one question and answers it in the shape the storefront's
 * JSX draws, so the client never holds a slug, a row id, or a table it could have queried.
 */
@Injectable()
export class StorefrontService {
  constructor(@Inject(DATA_CLIENT) private readonly db: Db) {}

  /* ---------- the chrome ---------- */

  /**
   * Every menu, resolved, in one read.
   *
   * All three locations rather than the one a caller happens to want, because the header asks for two
   * of them (`HEADER` for the category row, `MOBILE` for the drawer) and the footer for the third.
   * Reading one location per call would mean the same five tables read twice and two trees assembled
   * from two different moments, which is how a header and a footer end up disagreeing about whether a
   * category exists.
   *
   * The link resolution is one batched pass over every ref in every tree, so the number of queries is
   * bounded by the four kinds of target rather than by the size of the menu.
   */
  async menus(): Promise<NavMenu[]> {
    const rows = await this.db.menu.findMany({ include: MENU_INCLUDE, orderBy: { location: "asc" } });
    return this.trees(rows);
  }

  /**
   * The footer's link groups.
   *
   * A separate read from `menus()` because the footer's question is not the header's. The footer wants
   * the menu's *name* and its top-level links, with the ones that lead nowhere dropped, beside the
   * root categories — and "lead nowhere" is a rule about a page having no published blocks, which is
   * a question about the page table. The storefront used to answer it by reading every page row and
   * comparing the resulting hrefs by string, which meant the rule lived in a footer component and
   * could not be tested without rendering one.
   */
  async footer(): Promise<StorefrontFooter> {
    const [menu, categories] = await Promise.all([
      this.db.menu.findFirst({ where: { location: "FOOTER" }, include: MENU_INCLUDE }),
      this.db.category.findMany({
        where: { parentId: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { name: true, slug: true },
      }),
    ]);
    const categoryLinks: FooterLink[] = categories.map((c) => ({
      href: `/category/${c.slug}`,
      label: c.name,
    }));
    if (!menu) return { name: null, links: [], categories: categoryLinks };

    // A menu link to a page with nothing published on it renders as an empty page, so the footer drops
    // it. The rule is applied to the *target* rather than to the href it resolves to, because the
    // target is what names the page and the href is what the rule is about to remove.
    const emptyPages = new Set(
      (
        await this.db.page.findMany({ select: { id: true, publishedBlocks: true } })
      )
        .filter((page) => !Array.isArray(page.publishedBlocks) || page.publishedBlocks.length === 0)
        .map((page) => page.id),
    );

    const links = await resolveLinks(
      this.db,
      menu.items.map((item) => asLinkRef(item.target)),
    );
    const kept = menu.items
      .map((item, index) => ({ item, link: links[index] ?? null }))
      .filter(({ item }) => !leadsToEmptyPage(item.target, emptyPages));

    return {
      name: menu.name,
      links: kept.map(({ item, link }) => ({ href: link?.href ?? "#", label: item.label })),
      categories: categoryLinks,
    };
  }

  /* ---------- the blog ---------- */

  /** The published posts, newest first, as the blog index draws them. */
  async posts(limit: number): Promise<PostSummary[]> {
    const rows = await this.db.post.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishAt: { sort: "desc", nulls: "last" } },
      take: limit,
      select: { id: true, slug: true, title: true, excerpt: true, coverImage: true, publishAt: true },
    });
    return rows.map((row) => ({ ...row, publishAt: row.publishAt?.toISOString() ?? null }));
  }

  /**
   * One published post, or null when there is no such post a shopper may see.
   *
   * Null rather than an exception, so this method answers the question and the controller decides what
   * a null means — a 404 here and a 404 there must not be two different decisions in two files. An
   * unpublished post is not a different thing from an absent one to anyone reading the site, so both
   * answer null and both become the same 404.
   */
  async post(slug: string): Promise<PostDetail | null> {
    const row = await this.db.post.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        coverImage: true,
        publishAt: true,
        byline: true,
        body: true,
      },
    });
    if (!row) return null;
    return {
      ...row,
      publishAt: row.publishAt?.toISOString() ?? null,
      body: await this.withProductLinks(row.body),
    };
  }

  /* ---------- the sitemap ---------- */

  /**
   * Every public URL, as sitemap rows, with the shop's own host left for the client to add.
   *
   * Each section is read on its own and a section that fails is *named* rather than swallowed. That
   * is the whole design of this read, because the two obvious behaviours are both wrong here. Serving
   * a short sitemap drops URLs out of search results with nothing to show for it: no error, no alert,
   * no difference in any dashboard except a slow drift in indexed pages. Failing the whole read turns
   * a five-second problem into a 500 on the one route a crawler fetches most, and the answer is then
   * "no URLs" rather than "most URLs".
   *
   * So the route answers with whatever it could read, and says in the body which sections it could
   * not. The client logs that, which is what turns a silent loss into a visible one, and the next
   * successful read is a full sitemap again with nothing to clean up.
   */
  async sitemap(): Promise<SitemapRead> {
    const sections: Array<{ name: string; read: () => Promise<SitemapEntry[]> }> = [
      {
        name: "products",
        read: async () => {
          const rows = await this.db.product.findMany({
            where: { status: "PUBLISHED" },
            select: { slug: true, updatedAt: true },
          });
          return rows.map((row) => entry(`/product/${row.slug}`, row.updatedAt, "weekly", 0.8));
        },
      },
      {
        name: "categories",
        read: async () => {
          const rows = await this.db.category.findMany({ select: { slug: true } });
          return rows.map((row) => entry(`/category/${row.slug}`, null, "weekly", 0.7));
        },
      },
      {
        name: "collections",
        read: async () => {
          const rows = await this.db.collection.findMany({ select: { slug: true } });
          return rows.map((row) => entry(`/collection/${row.slug}`, null, "weekly", 0.5));
        },
      },
      {
        name: "pages",
        read: async () => {
          const rows = await this.db.page.findMany({
            where: { status: "PUBLISHED" },
            select: { slug: true, updatedAt: true },
          });
          return rows.map((row) => entry(`/${row.slug}`, row.updatedAt, "monthly", 0.4));
        },
      },
      {
        name: "posts",
        read: async () => {
          const rows = await this.db.post.findMany({
            where: { status: "PUBLISHED" },
            select: { slug: true, updatedAt: true },
          });
          return rows.map((row) => entry(`/blog/${row.slug}`, row.updatedAt, "monthly", 0.5));
        },
      },
    ];

    const settled = await Promise.allSettled(sections.map((section) => section.read()));
    const entries: SitemapEntry[] = [...STATIC_SITEMAP];
    const missing: string[] = [];
    settled.forEach((result, index) => {
      if (result.status === "fulfilled") entries.push(...result.value);
      else missing.push(sections[index].name);
    });

    return { entries, complete: missing.length === 0, missing };
  }

  /* ---------- the pieces the reads above share ---------- */

  /** Assemble the rows into trees, resolving every link in the whole set in one batched pass. */
  private async trees(rows: MenuRow[]): Promise<NavMenu[]> {
    const refs: (LinkRef | undefined)[] = [];
    for (const menu of rows) {
      for (const item of menu.items) {
        refs.push(asLinkRef(item.target));
        for (const child of item.children) refs.push(asLinkRef(child.target));
        for (const promo of item.promos) refs.push(asLinkRef(promo.link));
      }
    }
    const links = await resolveLinks(this.db, refs);

    // Positional consumption, in the same order the refs were collected above. `resolveLinks`
    // answers one entry per input by index, so walking both lists once is the join; doing it by id
    // would mean building a map keyed by a ref, which is the stringly-typed join this replaced.
    let at = 0;
    const take = () => links[at++] ?? null;

    return rows.map((menu) => ({
      location: menu.location,
      name: menu.name,
      tree: menu.items.map((item) => {
        const target = take();
        return {
          id: item.id,
          label: item.label,
          href: target?.href ?? "#",
          newTab: target?.newTab ?? false,
          display: item.display,
          children: item.children.map((child) => {
            const childLink = take();
            return {
              id: child.id,
              label: child.label,
              href: childLink?.href ?? "#",
              newTab: childLink?.newTab ?? false,
              display: child.display,
              children: [],
              promos: [],
            };
          }),
          promos: item.promos.map((promo) => {
            const promoLink = take();
            return {
              imageUrl: promo.imageUrl,
              alt: promo.alt,
              href: promoLink?.href ?? "#",
              newTab: promoLink?.newTab ?? false,
              ...(promo.heading ? { heading: promo.heading } : {}),
              ...(promo.subtext ? { subtext: promo.subtext } : {}),
            } satisfies NavPromo;
          }),
        } satisfies NavNode;
      }),
    }));
  }

  /**
   * A post body with every product mention turned into something drawable.
   *
   * The mention is an id in the document and a card on the page, and turning one into the other means
   * reading the product — so the read happens here, once, for the whole document, and the renderer
   * is left with a name, a link and an image.
   *
   * A mention whose product is gone is dropped, which is the whole of the deleted-product case: a
   * blog post that mentions a product the shop no longer sells still renders, minus that one card.
   * Failing the post instead would make a catalog deletion take a page of prose down with it, and a
   * 500 for a missing image is not a thing a shopper can do anything about.
   */
  private async withProductLinks(body: unknown): Promise<unknown> {
    const ids = new Set<string>();
    collectProductIds(body, ids, 0);
    if (ids.size === 0) return body;

    const products = await this.db.product.findMany({
      where: { id: { in: [...ids] } },
      select: {
        id: true,
        slug: true,
        name: true,
        // The card shows one image: the cheapest variant's first. The same rule the home page's
        // product grid uses, so a product looks the same wherever a shopper meets it.
        variants: { orderBy: { price: "asc" }, take: 1, select: { images: true } },
      },
    });
    const byId = new Map<string, ProductMention>(
      products.map((product) => [
        product.id,
        {
          name: product.name,
          href: `/product/${product.slug}`,
          image: product.variants[0]?.images?.[0] ?? null,
        },
      ]),
    );
    return rewriteProductLinks(body, byId, 0);
  }
}

/** One sitemap row. The host is the client's, so the entry carries a path and not a URL. */
function entry(
  path: string,
  updatedAt: Date | null,
  changeFrequency: SitemapEntry["changeFrequency"],
  priority: number,
): SitemapEntry {
  return { path, lastModified: updatedAt?.toISOString() ?? null, changeFrequency, priority };
}

/**
 * A stored menu target, as a link ref or as nothing.
 *
 * The column is JSON an operator wrote through a form, and two shapes of it exist in the wild: the
 * current `{ type, targetId }` and the `{ type, value }` the form used to save. Normalising first and
 * parsing second is what lets one read serve both, and a target that parses as neither is dropped
 * rather than guessed at — `resolveLinks` answers `null` for it, and a link that goes nowhere is
 * better than a link that goes to the wrong place.
 */
function asLinkRef(value: unknown): LinkRef | undefined {
  const parsed = linkRefSchema.safeParse(normalizeLinkRef(value as LinkRef | null | undefined));
  return parsed.success ? parsed.data : undefined;
}

/** Whether a menu item's target is a page with nothing published on it. */
function leadsToEmptyPage(target: unknown, emptyPages: Set<string>): boolean {
  const ref = asLinkRef(target);
  return ref?.type === "PAGE" && emptyPages.has(ref.targetId);
}

/** A rich-text node, or null for anything that is not one. */
function asBodyNode(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The product a `productCard` node names, if it names one. */
function productIdOf(attrs: unknown): string | undefined {
  if (!attrs || typeof attrs !== "object" || !("productId" in attrs)) return undefined;
  const { productId } = attrs;
  return typeof productId === "string" && productId !== "" ? productId : undefined;
}

/** Walk the document for the product ids its `productCard` nodes name. */
function collectProductIds(node: unknown, out: Set<string>, depth: number): void {
  if (depth > MAX_BODY_DEPTH) return;
  if (Array.isArray(node)) {
    for (const child of node) collectProductIds(child, out, depth + 1);
    return;
  }
  const candidate = asBodyNode(node);
  if (!candidate) return;
  if (candidate.type === "productCard") {
    const productId = productIdOf(candidate.attrs);
    if (productId) out.add(productId);
    return;
  }
  collectProductIds(candidate.content, out, depth + 1);
}

/**
 * Replace every `productCard` node with a `productLink` node, or with nothing at all.
 *
 * Returns `null` for a mention that cannot be resolved, and the caller drops nulls out of the list it
 * came from. Everything else is copied through untouched, including the keys this function does not
 * know about, because a body is content the shop's editor owns.
 */
function rewriteProductLinks(
  node: unknown,
  byId: Map<string, ProductMention>,
  depth: number,
): unknown {
  if (depth > MAX_BODY_DEPTH) return node;
  if (Array.isArray(node)) {
    return node
      .map((child) => rewriteProductLinks(child, byId, depth + 1))
      .filter((child) => child !== null);
  }
  const candidate = asBodyNode(node);
  if (!candidate) return node;
  if (candidate.type === "productCard") {
    const productId = productIdOf(candidate.attrs);
    const mention = productId ? byId.get(productId) : undefined;
    // A mention of a product that is gone leaves nothing behind, which is what keeps a catalog
    // deletion from taking a page of prose down with it.
    return mention ? { type: "productLink", attrs: mention } : null;
  }
  if (!Array.isArray(candidate.content)) return candidate;
  return { ...candidate, content: rewriteProductLinks(candidate.content, byId, depth + 1) };
}

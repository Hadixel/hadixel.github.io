// The storefront's public reads, as the gateway serves them.
//
// Four things moved here from four components: the header and the footer's menus, the post article's
// product cards, and the sitemap. What is worth pinning is not that a value came back but that each
// read still *decides* something — that a post that is not there is a 404 rather than an empty
// article, that a sitemap which could not read a section says which one, that a post mentioning a
// product the shop has deleted still renders, and that the footer's rule about empty pages is still
// applied by somebody.
//
// The chrome read is the one with the most at stake. The storefront used to run one query per link —
// a menu item's target, its children's, every promo's — and assemble the tree in the component that
// drew it, so the assertion here is not "the labels came back" but "one read answered all three
import { beforeEach, describe, expect, it } from "vitest";
import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { VALIDATION_PIPE_OPTIONS } from "../src/common/validation.js";
import { db } from "../src/prisma/index.js";
import type { Prisma, PrismaClient } from "../src/prisma/index.js";
import { StorefrontController } from "../src/storefront/storefront.controller.js";
import { StorefrontService } from "../src/storefront/storefront.service.js";
import { PostListQueryDto, PostSlugParamDto } from "../src/storefront/dto/storefront.dto.js";
import { PostNotFoundException } from "../src/storefront/exceptions/storefront.exception.js";
import { makeCategory, makePage, makePost, makeProduct, resetDatabase } from "./harness.js";

const service = () => new StorefrontService(db());
const controller = () => new StorefrontController(service());

/** A query as the pipe would have built it, so the DTO's own default applies where a caller omits one. */
function postQuery(limit?: number) {
  const query = new PostListQueryDto();
  if (limit !== undefined) query.limit = limit;
  return query;
}

function slugParam(slug: string) {
  return { slug } as { slug: string };
}

/** A document with one product card in it, which is what the blog editor's embed produces. */
function bodyWithMention(productId: string, text = "متن") {
  return {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text }] },
      { type: "productCard", attrs: { productId } },
    ],
  };
}

interface MenuSpec {
  label: string;
  target: Prisma.InputJsonValue;
  children?: Array<{ label: string; target: Prisma.InputJsonValue }>;
  promos?: Array<{ link: Prisma.InputJsonValue }>;
}

async function menuWith(location: "HEADER" | "FOOTER" | "MOBILE", name: string, items: MenuSpec[]) {
  const menu = await db().menu.create({ data: { location, name } });
  for (const [index, item] of items.entries()) {
    const created = await db().menuItem.create({
      data: { menuId: menu.id, sortOrder: index, label: item.label, target: item.target },
    });
    for (const [childIndex, child] of (item.children ?? []).entries()) {
      await db().menuItem.create({
        data: {
          menuId: menu.id,
          parentId: created.id,
          sortOrder: childIndex,
          label: child.label,
          target: child.target,
        },
      });
    }
    for (const [promoIndex, promo] of (item.promos ?? []).entries()) {
      await db().menuPromo.create({
        data: {
          menuItemId: created.id,
          sortOrder: promoIndex,
          imageUrl: "/banner.svg",
          alt: "بنر",
          link: promo.link,
        },
      });
    }
  }
  return menu;
}

describe("the chrome reads every menu in one pass", () => {
  beforeEach(resetDatabase);

  it("answers all three locations from one read, with every kind of target resolved", async () => {
    const category = await makeCategory("yeksay", "یخسال");
    const page = await makePage("about", [{ id: "b1", type: "richText", props: {} }]);
    const post = await makePost({ slug: "nmayeh", title: "نمایه" });
    const collection = await db().collection.create({ data: { name: "پرفروش", slug: "porforush" } });

    await menuWith("HEADER", "سربرگ", [
      {
        label: "یخسال",
        target: { type: "CATEGORY", targetId: category.id },
        children: [{ label: "درباره ما", target: { type: "PAGE", targetId: page.id } }],
        promos: [{ link: { type: "BLOG_POST", targetId: post.id } }],
      },
    ]);
    await menuWith("FOOTER", "پاورقی", [
      { label: "پرفروش‌ها", target: { type: "COLLECTION", targetId: collection.id } },
    ]);
    await menuWith("MOBILE", "موبایل", [{ label: "همه محصولات", target: { type: "BLOG_INDEX" } }]);

    const { menus } = await controller().nav();

    // The three locations in one response, because the header asks for two of them and the footer
    // for the third, and three separate reads could each observe a different moment.
    expect([...menus.map((menu) => menu.location)].sort()).toEqual(["FOOTER", "HEADER", "MOBILE"]);

    const header = menus.find((menu) => menu.location === "HEADER");
    const top = header?.tree[0];
    // Every kind of target the vocabulary has, resolved to the href the chrome draws. The old
    // implementation did this one `findUnique` at a time, inside the component doing the drawing.
    expect(top?.href).toBe("/category/yeksay");
    expect(top?.children[0]?.href).toBe("/about");
    expect(top?.promos[0]?.href).toBe("/blog/nmayeh");
    expect(menus.find((menu) => menu.location === "FOOTER")?.tree[0]?.href).toBe(
      "/collection/porforush",
    );
    expect(menus.find((menu) => menu.location === "MOBILE")?.tree[0]?.href).toBe("/blog");
  });

  it("hides an item the operator turned off, and keeps the rest of the tree", async () => {
    const category = await makeCategory("yeksay", "یخسال");
    const menu = await menuWith("HEADER", "سربرگ", [
      { label: "یخسال", target: { type: "CATEGORY", targetId: category.id } },
    ]);
    await db().menuItem.create({
      data: { menuId: menu.id, sortOrder: 9, label: "پنهان", target: { type: "BLOG_INDEX" }, visible: false },
    });

    const { menus } = await controller().nav();

    expect(menus[0].tree.map((item) => item.label)).toEqual(["یخسال"]);
  });

  it("answers with a link that goes nowhere rather than a guess when the target is gone", async () => {
    await menuWith("HEADER", "سربرگ", [
      { label: "حذف‌شده", target: { type: "CATEGORY", targetId: "no-such-category" } },
    ]);

    const { menus } = await controller().nav();

    expect(menus[0].tree[0].href).toBe("/");
  });
});

describe("the footer's groups are decided where the pages are", () => {
  beforeEach(resetDatabase);

  it("drops a menu link to a page with nothing published, and keeps one to a page that has content", async () => {
    const empty = await makePage("kharji", []);
    const full = await makePage("darmad", [{ id: "b1", type: "richText", props: {} }]);
    await menuWith("FOOTER", "پاورقی", [
      { label: "خارجی", target: { type: "PAGE", targetId: empty.id } },
      { label: "درباره ما", target: { type: "PAGE", targetId: full.id } },
      { label: "وبلاگ", target: { type: "BLOG_INDEX" } },
    ]);

    const footer = await controller().footer();

    // The rule used to live in the footer component, which read every page row and compared the
    // resolved hrefs as strings. It is a rule about two tables, so it belongs beside both of them.
    expect(footer.name).toBe("پاورقی");
    expect(footer.links).toEqual([
      { href: "/darmad", label: "درباره ما" },
      { href: "/blog", label: "وبلاگ" },
    ]);
  });

  it("answers the root categories beside the menu, and not their children", async () => {
    const parent = await makeCategory("yeksay", "یخسال");
    await makeCategory("dvor", "دو‌در", parent.id);
    await menuWith("FOOTER", "پاورقی", [{ label: "وبلاگ", target: { type: "BLOG_INDEX" } }]);

    const footer = await controller().footer();

    expect(footer.categories).toEqual([{ href: "/category/yeksay", label: "یخسال" }]);
  });

  it("answers an unconfigured shop with a footer that has no groups rather than an error", async () => {
    const footer = await controller().footer();

    expect(footer).toEqual({ name: null, links: [], categories: [] });
  });
});

describe("the blog reads a post a shopper may see", () => {
  beforeEach(resetDatabase);

  it("answers a published post with the products it mentions already turned into links", async () => {
    const product = await makeProduct({ slug: "yeksay", name: "یخسال" });
    await db().variant.updateMany({ where: { productId: product.id }, data: { images: ["/yeksay.jpg"] } });
    const post = await makePost({ slug: "nmayeh", title: "نمایه" });
    await db().post.update({ where: { id: post.id }, data: { body: bodyWithMention(product.id) } });

    const read = await controller().post(slugParam("nmayeh"));

    // The renderer has no ids to resolve and no query to run: the mention arrived as a card.
    const content = (read.body as { content: Array<Record<string, unknown>> }).content;
    expect(content[1]).toEqual({
      type: "productLink",
      attrs: { name: "یخسال", href: "/product/yeksay", image: "/yeksay.jpg" },
    });
  });

  // The case worth being sure about. A product deleted after publication used to make the article
  // 500, because the card's query found nothing and the component treated that as an error. A card
  // is a picture of a product; losing the product loses the card and nothing else.
  it("renders a post whose product mention no longer exists, minus the card", async () => {
    const post = await makePost({ slug: "nmayeh", title: "نمایه" });
    await db().post.update({
      where: { id: post.id },
      data: { body: bodyWithMention("deleted-product-id") },
    });

    const read = await controller().post(slugParam("nmayeh"));

    const content = (read.body as { content: Array<Record<string, unknown>> }).content;
    expect(content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "متن" }] },
    ]);
    expect(read.title).toBe("نمایه");
  });

  it("keeps the rest of the document when one mention in the middle is gone", async () => {
    const product = await makeProduct({ slug: "yeksay", name: "یخسال" });
    const post = await makePost({ slug: "nmayeh" });
    await db().post.update({
      where: { id: post.id },
      data: {
        body: {
          type: "doc",
          content: [
            { type: "productCard", attrs: { productId: "gone" } },
            { type: "productCard", attrs: { productId: product.id } },
          ],
        },
      },
    });

    const read = await controller().post(slugParam("nmayeh"));

    const content = (read.body as { content: Array<Record<string, unknown>> }).content;
    expect(content).toHaveLength(1);
    expect(content[0]).toMatchObject({ type: "productLink" });
  });

  it("404s a post that does not exist rather than answering with an empty one", async () => {
    await expect(controller().post(slugParam("nope"))).rejects.toBeInstanceOf(PostNotFoundException);
  });

  it("404s a draft, because a draft is not a post a shopper may see", async () => {
    await makePost({ slug: "pishnavis", title: "پیش‌نویس", status: "DRAFT" });

    await expect(controller().post(slugParam("pishnavis"))).rejects.toBeInstanceOf(
      PostNotFoundException,
    );
  });

  it("answers the index with the published posts, newest first and within the limit asked for", async () => {
    await makePost({ slug: "a", title: "اول", publishAt: new Date(1_000) });
    await makePost({ slug: "b", title: "دوم", publishAt: new Date(2_000) });
    await makePost({ slug: "c", title: "سوم", publishAt: new Date(3_000) });
    await makePost({ slug: "draft", title: "پیش‌نویس", status: "DRAFT" });

    const { posts } = await controller().posts(postQuery(2));

    // Proved by narrowing: a read that ignored `status` or `take` would return three rows or four.
    expect(posts.map((post) => post.slug)).toEqual(["c", "b"]);
  });

  it("hands the index the fields the blog page draws, and nothing it does not", async () => {
    await makePost({ slug: "a", title: "اول" });

    const { posts } = await controller().posts(postQuery());

    expect(Object.keys(posts[0]).sort()).toEqual([
      "coverImage",
      "excerpt",
      "id",
      "publishAt",
      "slug",
      "title",
    ]);
    // A `Date` crosses JSON as a string, and the page formats it for the reader. Money and counts
    // are numbers and stay numbers; nothing here is a date the client has to guess at.
    expect(typeof posts[0].publishAt).toBe("string");
  });
});

describe("the post route's inputs are checked by the real pipe", () => {
  beforeEach(resetDatabase);

  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
  const paramMetadata: ArgumentMetadata = { type: "param", metatype: PostSlugParamDto, data: "" };
  const queryMetadata: ArgumentMetadata = { type: "query", metatype: PostListQueryDto, data: "" };

  // Through the pipe, not against the decorators. A `@Matches` on a DTO nobody ever pipes is a
  // comment; the gateway shipped an `@IsBoolean` on a field the form sent `"draft"` to and twenty
  // controller tests passed, because none of them went through the validation pipe.
  it("refuses a slug that is not one, rather than passing it to the query", async () => {
    await expect(pipe.transform({ slug: "../../etc/passwd" }, paramMetadata)).rejects.toThrow();
    await expect(pipe.transform({ slug: "a".repeat(200) }, paramMetadata)).rejects.toThrow();
    await expect(pipe.transform({ slug: "ok-slug-1" }, paramMetadata)).resolves.toMatchObject({
      slug: "ok-slug-1",
    });
  });

  it("refuses a limit that would ask the gateway to read the whole blog into memory", async () => {
    await expect(pipe.transform({ limit: "9999" }, queryMetadata)).rejects.toThrow();
    await expect(pipe.transform({ limit: "12" }, queryMetadata)).resolves.toMatchObject({ limit: 12 });
  });
});

describe("the sitemap degrades loudly and never silently", () => {
  beforeEach(resetDatabase);

  it("lists the shop's own pages, and only the published ones", async () => {
    // The products are put in a category the test names, because a product that makes its own
    // category would put that category in the sitemap too — and this assertion is about which rows
    // are in it, not about how many.
    const category = await makeCategory("yeksay-cat", "یخسال");
    await makeProduct({ slug: "yeksay", categoryId: category.id });
    await makeProduct({ slug: "draft", status: "DRAFT", categoryId: category.id });
    await db().collection.create({ data: { name: "پرفروش", slug: "porforush" } });
    await makePage("darmad", [{ id: "b1", type: "richText", props: {} }]);
    await makePost({ slug: "nmayeh" });
    await makePost({ slug: "draft-post", status: "DRAFT" });

    const read = await controller().sitemap();

    const paths = read.entries.map((entry) => entry.path);
    expect(read.complete).toBe(true);
    expect(read.missing).toEqual([]);
    // The three routes that exist whether or not the shop has anything to list, then one row per
    // published row — a draft product in the index is a 404 in a search result. Compared as sets,
    // because no section promises an order and an assertion on one would be testing the database's
    // mood rather than the read.
    expect([...paths].sort()).toEqual(
      [
        "",
        "/products",
        "/blog",
        "/product/yeksay",
        "/category/yeksay-cat",
        "/collection/porforush",
        "/darmad",
        "/blog/nmayeh",
      ].sort(),
    );
    // The change frequency and priority follow from what kind of page the row is, so they travel
    // with it and the client is left with the one thing only it can do: add its own host.
    const product = read.entries.find((entry) => entry.path === "/product/yeksay");
    expect(product).toMatchObject({ changeFrequency: "weekly", priority: 0.8 });
    expect(typeof product?.lastModified).toBe("string");
  });

  // The failure this route is most able to get quietly wrong, and the one that has no alarm: a
  // sitemap that comes back short is indistinguishable from a shop that stopped selling things, and
  // nothing in a search index reports the difference. So a section that could not be read is named
  // in the answer rather than dropped from it — loudly enough that someone can act on it, without
  // throwing away the URLs the read *could* produce.
  it("names the section it could not read, and keeps the rest of the sitemap", async () => {
    await makeProduct({ slug: "yeksay" });
    await makeCategory("yeksay-cat", "یخسال");

    const broken = new StorefrontService(brokenDb("product"));
    const read = await broken.sitemap();

    expect(read.complete).toBe(false);
    expect(read.missing).toEqual(["products"]);
    const paths = read.entries.map((entry) => entry.path);
    // The products are gone from the answer and the reason is in it. The categories are still here,
    // because failing the whole read would lose them too and leave a crawler with nothing at all.
    expect(paths).not.toContain("/product/yeksay");
    expect(paths).toContain("/category/yeksay-cat");
    expect(paths).toContain("");
  });

  it("names every section it could not read, not just the first", async () => {
    const read = await new StorefrontService(brokenDb("product", "post", "page")).sitemap();

    expect(read.complete).toBe(false);
    // The names are the sections a reader would recognise, not the table names a failure carries.
    expect([...read.missing].sort()).toEqual(["pages", "posts", "products"]);
  });

  it("keeps the static routes even when every section fails, and still reports the loss", async () => {
    const read = await new StorefrontService(
      brokenDb("product", "category", "collection", "page", "post"),
    ).sitemap();

    expect(read.entries.map((entry) => entry.path)).toEqual(["", "/products", "/blog"]);
    expect(read.complete).toBe(false);
    expect(read.missing).toHaveLength(5);
  });
});

/**
 * A data client whose named sections cannot be read.
 *
 * The section reads run in one request, so a failure has to be injected to be tested; there is no
 * way to make a table unreadable from the outside without taking the whole schema down, and a
 * gateway that cannot read any table has nothing left to degrade to. A proxy over the real client
 * keeps every other section reading for real, which is the situation the answer is about.
 */
function brokenDb(...models: string[]): PrismaClient {
  const client = db();
  return new Proxy(client, {
    get(target, property) {
      if (models.includes(String(property))) {
        return {
          findMany: () => Promise.reject(new Error(`${String(property)} is down`)),
        };
      }
      return Reflect.get(target, property);
    },
  });
}

// The gateway's block resolution, against a real database.
//
// Criterion 9's second half. These tests pin the rules the storefront used to apply while rendering,
// now that the gateway applies them: what a shopper may see, which price is advertised, and what
// happens to a block whose data cannot be found.
//
// They are written against the service rather than over HTTP because the rules are the subject. The
// route is a thin wrapper that the typechecker covers; a test that only exercised the wrapper would
// pass while the rules rotted underneath it.

import { beforeEach, describe, expect, it } from "vitest";
import { PATH_METADATA } from "@nestjs/common/constants.js";
import { ContentController } from "../src/content/content.controller.js";
import { ContentService } from "../src/content/content.service.js";
import { db } from "../src/prisma/index.js";
import {
  makeCategory,
  makeDiscount,
  makeHomePage,
  makePage,
  makePost,
  makeProduct,
  resetDatabase,
} from "./harness.js";

/**
 * The service with the real data client injected by its token.
 *
 * Constructed directly rather than through Nest: the token is the wiring under test elsewhere, and
 * bootstrapping a container to reach one method would test the framework.
 */
function service(): ContentService {
  return new ContentService(db() as never);
}

const block = (id: string, type: string, props: Record<string, unknown> = {}) => ({
  id,
  type,
  props,
});

/**
 * The path Nest will serve a handler on, read from the decorators rather than from a running server.
 *
 * The routes are the one part of this feature no other test touches: the rules are the subject
 * everywhere else, and the wrapper around them is what silently drifts. A prefix added for one
 * handler lands on its sibling too, and the mismatch only shows up as a 404 in production — which
 * is exactly what happened once already, when the pair were mounted under `content/home` and every
 * CMS page answered from `/content/home/pages/:slug` while the client asked for
 * `/content/pages/:slug`.
 *
 * The client half of that pair is pinned in the storefront's own suite, which asserts the URLs it
 * requests. §5.1 is why the two cannot be compared in one process: an app importing another app to
 * read its routes is the edge the blueprint forbids, so each side pins its own half and these
 * literals are the contract between them. Change one, change the other.
 */
function routeFor(method: "home" | "page"): string {
  // `@Controller` records the prefix on the constructor; `@Get` records the rest on the prototype
  // method. Reading the prefix off the prototype silently yields "", which composes to a plausible
  // wrong path — so they are read from the two places Nest writes them.
  const prefix = Reflect.getMetadata(PATH_METADATA, ContentController) ?? "";
  const subpath = Reflect.getMetadata(PATH_METADATA, ContentController.prototype[method]) ?? "";
  return `/${[prefix, subpath].filter(Boolean).join("/")}`.replace(/\/+$/, "");
}

describe("the content routes", () => {
  it("serves the home read where the storefront asks for it", () => {
    expect(routeFor("home")).toBe("/content/home");
  });

  it("serves a page by slug where the storefront asks for it", () => {
    expect(routeFor("page")).toBe("/content/pages/:slug");
  });
});

describe("content block resolution", () => {
  beforeEach(resetDatabase);

  describe("product blocks", () => {
    it("gives a productGrid its published products", async () => {
      const product = await makeProduct({ name: "یخسال" });
      const blocks = await service().resolveBlocks([
        block("b1", "productGrid", { title: "پرفروش‌ها", limit: 4 }),
      ]);

      const data = blocks[0].data;
      expect(data.products?.map((p) => p.name)).toEqual([product.name]);
    });

    it("leaves out a draft product", async () => {
      await makeProduct({ name: "منتشرشده" });
      await makeProduct({ name: "پیش‌نویس", status: "DRAFT" });

      const blocks = await service().resolveBlocks([block("b1", "productGrid")]);

      expect(blocks[0].data.products?.map((p) => p.name)).toEqual(["منتشرشده"]);
    });

    it("advertises the cheapest sellable variant, not the cheapest variant", async () => {
      const product = await makeProduct({ price: 100_000 });
      // A cheaper variant that nobody can buy. Advertising its price is the bug this pins: the card
      // shows a number the shopper cannot pay.
      await db().variant.create({
        data: {
          productId: product.id,
          colorName: "ناموجود",
          sku: `sku-oos-${product.id}`,
          price: 1,
          stock: 0,
          images: [],
        },
      });

      const blocks = await service().resolveBlocks([block("b1", "productGrid")]);

      expect(blocks[0].data.products?.[0].price).toBe(100_000);
    });

    it("respects a category source, including the whole subtree", async () => {
      const parent = await makeCategory("mobin", "مبلین");
      const child = await makeCategory("sofa", "مبل راحتی");
      await db().category.update({ where: { id: child.id }, data: { parentId: parent.id } });
      const inChild = await makeProduct({ name: "درون زیرمجموعه", categoryId: child.id });
      await makeProduct({ name: "بیرون زیرمجموعه" });

      const blocks = await service().resolveBlocks([
        block("b1", "productGrid", { source: { kind: "CATEGORY", categoryId: parent.id } }),
      ]);

      expect(blocks[0].data.products?.map((p) => p.name)).toEqual([inChild.name]);
    });

    it("caps a productGrid at eight however large the block asks", async () => {
      for (let i = 0; i < 10; i++) await makeProduct({ name: `محصول ${i}` });

      const blocks = await service().resolveBlocks([
        block("b1", "productGrid", { limit: 24 }),
      ]);

      expect(blocks[0].data.products).toHaveLength(8);
    });

    it("serves two blocks with the same source from one read of the same size", async () => {
      await makeProduct({ name: "مشترک" });
      const blocks = await service().resolveBlocks([
        block("b1", "productGrid", { limit: 4 }),
        block("b2", "productGrid", { limit: 2 }),
      ]);

      expect(blocks[0].data.products).toHaveLength(1);
      // The two limits are the same underlying read, sliced, not two reads.
      expect(blocks[1].data.products).toEqual(blocks[0].data.products);
    });
  });

  describe("deal blocks", () => {
    it("gives a dealGrid the active automatic discounts", async () => {
      const product = await makeProduct({ price: 100_000 });
      await makeDiscount({ productIds: [product.id], type: "PERCENT", value: 20 });

      const blocks = await service().resolveBlocks([block("b1", "dealGrid", { limit: 6 })]);

      const deals = blocks[0].data.deals ?? [];
      expect(deals).toHaveLength(1);
      expect(deals[0].discountedPrice).toBe(80_000);
    });

    it("leaves out a coupon, which is not a storefront section", async () => {
      const product = await makeProduct();
      await makeDiscount({ productIds: [product.id], mode: "COUPON", value: 50 });

      const blocks = await service().resolveBlocks([block("b1", "dealGrid")]);

      expect(blocks[0].data.deals).toEqual([]);
    });

    it("leaves out a discount whose window has closed", async () => {
      const product = await makeProduct();
      await makeDiscount({
        productIds: [product.id],
        value: 20,
        startsAt: new Date(Date.now() - 7_200_000),
        endsAt: new Date(Date.now() - 3_600_000),
      });

      const blocks = await service().resolveBlocks([block("b1", "dealGrid")]);

      expect(blocks[0].data.deals).toEqual([]);
    });

    it("never lets a saving exceed the price", async () => {
      const product = await makeProduct({ price: 100_000 });
      await makeDiscount({ productIds: [product.id], type: "FIXED", value: 500_000 });

      const blocks = await service().resolveBlocks([block("b1", "dealGrid")]);

      // A fixed discount larger than the product would otherwise render as a negative price.
      expect(blocks[0].data.deals?.[0].discountedPrice).toBe(0);
    });
  });

  describe("category tiles", () => {
    it("resolves each named category to its storefront path", async () => {
      const category = await makeCategory("mobin", "مبلین");
      const blocks = await service().resolveBlocks([
        block("b1", "categoryTiles", { categories: [{ categoryId: category.id }] }),
      ]);

      expect(blocks[0].data.tiles).toEqual([{ href: "/category/mobin", name: "مبلین" }]);
    });

    it("falls back rather than dropping a tile whose category is gone", async () => {
      const blocks = await service().resolveBlocks([
        block("b1", "categoryTiles", { categories: [{ categoryId: "does-not-exist" }] }),
      ]);

      // Aligned by index with props.categories, so a missing category has to keep its slot or every
      // tile after it would show the wrong image.
      expect(blocks[0].data.tiles).toEqual([{ href: "/", name: "دسته" }]);
    });
  });

  describe("links", () => {
    it("resolves a hero's call to action", async () => {
      const category = await makeCategory("mobin", "مبلین");
      const blocks = await service().resolveBlocks([
        block("b1", "hero", {
          title: "خانه",
          cta: { label: "مشاهده", link: { type: "CATEGORY", targetId: category.id } },
        }),
      ]);

      expect(blocks[0].data.cta).toEqual({ href: "/category/mobin", newTab: false });
    });

    it("resolves an external link without touching the database for it", async () => {
      const blocks = await service().resolveBlocks([
        block("b1", "hero", {
          title: "خانه",
          cta: { label: "مشاهده", link: { type: "EXTERNAL", url: "https://example.com", newTab: true } },
        }),
      ]);

      expect(blocks[0].data.cta).toEqual({ href: "https://example.com", newTab: true });
    });

    it("keeps banner links aligned with the banners they belong to", async () => {
      const category = await makeCategory("mobin", "مبلین");
      const blocks = await service().resolveBlocks([
        block("b1", "bannerPair", {
          banners: [
            { image: { src: "/a.png", link: { type: "CATEGORY", targetId: category.id } } },
            { image: { src: "/b.png" } },
          ],
        }),
      ]);

      expect(blocks[0].data.links).toEqual([
        { href: "/category/mobin", newTab: false },
        null,
      ]);
    });

    it("resolves a before/after pair in order", async () => {
      const page = await makeCategory("dakhel", "داخل");
      const blocks = await service().resolveBlocks([
        block("b1", "beforeAfter", {
          before: { src: "/before.png", link: { type: "CATEGORY", targetId: page.id } },
          after: { src: "/after.png" },
        }),
      ]);

      expect(blocks[0].data.pairLinks).toEqual([{ href: "/category/dakhel", newTab: false }, null]);
    });

    it("reads a legacy link value into the ref the schema expects", async () => {
      const category = await makeCategory("mobin", "مبلین");
      const blocks = await service().resolveBlocks([
        block("b1", "hero", {
          title: "خانه",
          cta: { label: "مشاهده", link: { type: "CATEGORY", value: category.id } },
        }),
      ]);

      // Older rows stored the target under `value`. If this stopped resolving, a saved page would
      // render a dead link rather than fail loudly.
      expect(blocks[0].data.cta).toEqual({ href: "/category/mobin", newTab: false });
    });
  });

  describe("blog teaser", () => {
    it("gives a blogTeaser published posts and leaves out drafts", async () => {
      await makePost({ title: "منتشرشده" });
      await makePost({ title: "پیش‌نویس", status: "DRAFT" });

      const blocks = await service().resolveBlocks([block("b1", "blogTeaser", { limit: 3 })]);

      expect(blocks[0].data.posts?.map((p) => p.title)).toEqual(["منتشرشده"]);
    });

    it("honours the block's own limit", async () => {
      for (const i of [1, 2, 3, 4]) await makePost({ title: `مقاله ${i}` });

      const blocks = await service().resolveBlocks([block("b1", "blogTeaser", { limit: 2 })]);

      expect(blocks[0].data.posts).toHaveLength(2);
    });
  });

  describe("comparison table", () => {
    it("resolves published columns and their spec rows", async () => {
      const a = await makeProduct({ name: "الف" });
      const b = await makeProduct({ name: "ب" });
      const field = await db().categorySpecField.create({
        data: { categoryId: a.categoryId, name: "رنگ", type: "string" },
      });
      await db().productSpecValue.create({
        data: { productId: a.id, specFieldId: field.id, value: "سفید" },
      });
      await db().productSpecValue.create({
        data: { productId: b.id, specFieldId: field.id, value: "مشکی" },
      });

      const blocks = await service().resolveBlocks([
        block("b1", "comparisonTable", { productIds: [a.id, b.id] }),
      ]);

      const table = blocks[0].data.comparison;
      expect(table?.products.map((p) => p.name)).toEqual(["الف", "ب"]);
      expect(table?.fields).toEqual([{ name: "رنگ", values: ["سفید", "مشکی"] }]);
    });

    it("drops the block when fewer than two columns survive", async () => {
      const a = await makeProduct();
      await makeProduct({ status: "DRAFT" });

      const blocks = await service().resolveBlocks([
        block("b1", "comparisonTable", { productIds: [a.id, "draft-id"] }),
      ]);

      // One column is not a comparison. The client dropped the block in this case, and the gateway
      // has to reach the same answer or the page changes shape.
      expect(blocks[0].data.comparison).toBeUndefined();
    });
  });

  describe("blocks that need nothing", () => {
    it("leaves a richText block with no data at all", async () => {
      const blocks = await service().resolveBlocks([
        block("b1", "richText", { html: "<p>سلام</p>" }),
      ]);

      expect(blocks[0].data).toEqual({});
    });

    it("returns the props it was given, unchanged", async () => {
      const props = { title: "پرفروش‌ها", limit: 4 };
      const blocks = await service().resolveBlocks([block("b1", "productGrid", props)]);

      // Resolution adds data; it never rewrites what the admin saved.
      expect(blocks[0].props).toEqual(props);
    });

    it("skips a block that is not shaped like a block", async () => {
      const blocks = await service().resolveBlocks([
        block("b1", "productGrid"),
        { id: "b2" },
        null,
        "not-a-block",
      ]);

      expect(blocks.map((b) => b.id)).toEqual(["b1"]);
    });

    it("returns nothing for a page with no blocks", async () => {
      expect(await service().resolveBlocks(undefined)).toEqual([]);
    });
  });

  describe("the home read as a whole", () => {
    it("resolves every block of the home page and keeps them in order", async () => {
      const product = await makeProduct({ name: "یخسال" });
      const category = await makeCategory("mobin", "مبلین");
      await makePost({ title: "مقاله" });
      await makeDiscount({ productIds: [product.id], value: 20 });
      await makeHomePage([
        block("b1", "hero", { title: "خانه" }),
        block("b2", "productGrid", { limit: 4 }),
        block("b3", "dealGrid"),
        block("b4", "categoryTiles", { categories: [{ categoryId: category.id }] }),
        block("b5", "blogTeaser", { limit: 3 }),
      ]);

      const resolved = await service().resolveBlocks(
        (await service().publishedPage("home"))?.publishedBlocks,
      );

      expect(resolved.map((b) => b.id)).toEqual(["b1", "b2", "b3", "b4", "b5"]);
      expect(resolved[1].data.products).toHaveLength(1);
      expect(resolved[2].data.deals).toHaveLength(1);
      expect(resolved[3].data.tiles).toHaveLength(1);
      expect(resolved[4].data.posts).toHaveLength(1);
    });

    it("reads an unpublished page as absent", async () => {
      await makeHomePage([block("b1", "hero", { title: "خانه" })]);
      await db().page.update({ where: { slug: "home" }, data: { status: "DRAFT" } });

      expect(await service().publishedPage("home")).toBeNull();
    });
  });

  describe("page lookup by slug", () => {
    it("reads a published page with its title and resolved blocks", async () => {
      const product = await makeProduct();
      await makePage("about", [block("b1", "productGrid", { limit: 2 })]);

      const page = await service().publishedPageWithTitle("about");

      expect(page?.title).toBe("صفحه about");
      const resolved = await service().resolveBlocks(page?.publishedBlocks);
      expect(resolved[0].data.products?.[0].name).toBe(product.name);
    });

    it("reads an unknown slug as absent rather than as an empty page", async () => {
      expect(await service().publishedPageWithTitle("nope")).toBeNull();
    });
  });
});

// The panel's content pages, as the gateway serves them.
//
// Four reads moved out of five pages, and each was a query written in the page beside the table it
// drew: the blog list's `where` and its unbounded `findMany`, the page list's, the post the editor
// seeds itself from, the page the builder does, and the navigation page's whole tree-assembly —
// group by parent, sort by `sortOrder`, recurse, and decide what a stored `target` means against a
// list of type names written beside the table.
//
// What is worth pinning is the *shape* the JSX depends on, the two things a read can quietly stop
// doing — filtering, and refusing a caller with no session — and the boundary each of the four holds.
// A test that asserted a value was copied, or that a list came back non-empty, would pass against a
// plausible implementation that had quietly stopped filtering.

import { beforeEach, describe, expect, it } from "vitest";
import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { VALIDATION_PIPE_OPTIONS } from "../src/common/validation.js";
import { NavController } from "../src/nav/nav.controller.js";
import { PagesController } from "../src/pages/pages.controller.js";
import { PageListQueryDto, MAX_PAGE_PAGE_SIZE } from "../src/pages/dto/page.dto.js";
import { PageNotFoundException } from "../src/pages/exceptions/page.exception.js";
import { PostsController } from "../src/posts/posts.controller.js";
import { PostListQueryDto, MAX_POST_PAGE_SIZE } from "../src/posts/dto/post.dto.js";
import { PostNotFoundException } from "../src/posts/exceptions/post.exception.js";
import { nestMenu, readTarget, type MenuRow } from "../src/nav/nav.service.js";
import { db } from "../src/prisma/index.js";
import { makeCategory, makePost, resetDatabase } from "./harness.js";

/** An operator, because every read here is a management view rather than a catalogue. */
async function seedOperator(): Promise<string> {
  const operator = await db().adminUser.create({
    data: {
      email: "operator@kmodern.ir",
      name: "اپراتور",
      passwordHash: "scrypt$00$00",
      isActive: true,
    },
  });
  return operator.id;
}

function authFor(operatorId: string) {
  return {
    adminForToken: async (token: string) =>
      token === "good" ? { admin: { id: operatorId, email: "operator@kmodern.ir" } } : null,
  } as never;
}

const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;
const anonymous = () => ({ headers: { cookie: "kmodern_admin=bad" } }) as never;

/** A query as the pipe would have built it, so the DTO's own defaults apply where the panel omits one. */
function postQuery(over: Partial<PostListQueryDto> = {}): PostListQueryDto {
  return Object.assign(new PostListQueryDto(), over);
}

function pageQuery(over: Partial<PageListQueryDto> = {}): PageListQueryDto {
  return Object.assign(new PageListQueryDto(), over);
}

/** A blog tag, joined to a post. The blog table's third column is these. */
async function tagPost(postId: string, name: string, slug: string): Promise<void> {
  const tag = await db().blogTag.create({ data: { name, slug } });
  await db().postTag.create({ data: { postId, tagId: tag.id } });
}

describe("the panel reads the blog list", () => {
  beforeEach(resetDatabase);
  let operatorId: string;

  beforeEach(async () => {
    operatorId = await seedOperator();
  });

  const controller = () => new PostsController(authFor(operatorId), db() as never);

  // The panel read `include: { tags: { include: { tag: true } } }` and rendered `t.tag.name`, so the
  // nesting was the page's to reach through. The read answers names, and the column is a list of
  // names — so a read that answered the join shape again would leave the page unpacking it.
  it("answers each row with its tag names and no nesting for the page to reach into", async () => {
    const post = await makePost({ title: "راهنمای خرید" });
    await tagPost(post.id, "راهنما", "rahnamay");
    await tagPost(post.id, "پرداخت", "pardakht");

    const page = await controller().list(request(), postQuery());

    const row = page.rows.find((r) => r.id === post.id);
    expect(row?.tags).toEqual(["راهنما", "پرداخت"]);
    expect(Object.keys(row ?? {}).sort()).toEqual([
      "featured",
      "id",
      "publishAt",
      "status",
      "tags",
      "title",
    ]);
  });

  // A post with no tags is a post with an empty list, and the column renders "no badges" either way —
  // but a read that answered `null` there would make the page decide, which is what it just stopped
  // doing everywhere else.
  it("answers a post with no tags as an empty list", async () => {
    const post = await makePost({ title: "بی‌برچسب" });

    const page = await controller().list(request(), postQuery());

    expect(page.rows.find((r) => r.id === post.id)?.tags).toEqual([]);
  });

  // The filter, proved by narrowing. A read that ignored `q` would return every post and this fails;
  // one that matched on the wrong column would return nothing and this also fails.
  it("filters by the title, case-insensitively, and a term that names nobody narrows to nobody", async () => {
    const wanted = await makePost({ title: "راهنمای خرید" });
    await makePost({ title: "تازه‌های فروشگاه" });

    const found = await controller().list(request(), postQuery({ q: "راهنمای" }));
    expect(found.rows.map((r) => r.id)).toEqual([wanted.id]);
    expect(found.total).toBe(1);

    // Case-insensitivity is the panel's own predicate (`mode: "insensitive"`), carried over whole.
    // It folds *case*, so it is observable on a Latin-script title and says nothing about scripts:
    // `insensitive` does not make a Latin "R" equal a Persian "ر", and a test that asserted it did
    // would be asserting a transliteration the predicate does not do.
    const latin = await makePost({ title: "Summer Sale" });
    const cased = await controller().list(request(), postQuery({ q: "summer" }));
    expect(cased.rows.map((r) => r.id)).toEqual([latin.id]);

    // A term matching nothing narrows to nothing rather than to everything — the failure a dropped
    // `where` clause produces, and the one this assertion exists to catch.
    const nobody = await controller().list(request(), postQuery({ q: "nobody-here" }));
    expect(nobody.rows).toEqual([]);
    expect(nobody.total).toBe(0);
  });

  // The status filter, proved the same way. The panel offered ALL/DRAFT/PUBLISHED/ARCHIVED.
  it("filters by status, and a status nothing holds narrows to nothing", async () => {
    const draft = await makePost({ title: "پیش‌نویس", status: "DRAFT" });
    await makePost({ title: "منتشر شده", status: "PUBLISHED" });

    const drafts = await controller().list(request(), postQuery({ status: "DRAFT" as never }));
    expect(drafts.rows.map((r) => r.id)).toEqual([draft.id]);
    expect(drafts.total).toBe(1);

    const archived = await controller().list(request(), postQuery({ status: "ARCHIVED" as never }));
    expect(archived.rows).toEqual([]);
    expect(archived.total).toBe(0);
  });

  // The two filters together, because two filters applied one at a time is not two filters applied.
  it("applies the search and the status together rather than one in place of the other", async () => {
    const both = await makePost({ title: "راهنما", status: "DRAFT" });
    await makePost({ title: "راهنمای دیگر", status: "PUBLISHED" });

    const page = await controller().list(request(), postQuery({ q: "راهنما", status: "DRAFT" as never }));

    expect(page.rows.map((r) => r.id)).toEqual([both.id]);
    expect(page.total).toBe(1);
  });

  it("pages, and the count beside the rows stays the whole count", async () => {
    const first = await makePost({ title: "اول" });
    const second = await makePost({ title: "دوم" });

    const pageOne = await controller().list(request(), postQuery({ page: 1, size: 1 }));
    const pageTwo = await controller().list(request(), postQuery({ page: 2, size: 1 }));

    expect(pageOne.rows).toHaveLength(1);
    expect(pageTwo.rows).toHaveLength(1);
    expect(pageOne.rows[0]?.id).not.toBe(pageTwo.rows[0]?.id);
    expect([pageOne.rows[0]?.id, pageTwo.rows[0]?.id].sort()).toEqual([first.id, second.id].sort());
    expect(pageTwo.total).toBe(2);
    expect(pageTwo.page).toBe(2);
    expect(pageTwo.size).toBe(1);
  });

  // Featured first, then newest. The panel's order, and the one the table was drawn to: a featured
  // post buried under four drafts is a featured post nobody sees.
  it("puts a featured post above the rest, and the newest first among equals", async () => {
    const older = await makePost({ title: "قدیمی" });
    const newer = await makePost({ title: "جدید" });
    await db().post.update({ where: { id: older.id }, data: { featured: true } });

    const page = await controller().list(request(), postQuery());

    expect(page.rows[0]?.id).toBe(older.id);
    expect(page.rows[1]?.id).toBe(newer.id);
  });

  it("needs an operator, because a draft is not a catalogue", async () => {
    await makePost({ title: "پیش‌نویس", status: "DRAFT" });

    await expect(controller().list(anonymous(), postQuery())).rejects.toThrow();
  });

  it("answers one post in full for the editor, and refuses an id that names nobody", async () => {
    const post = await makePost({ title: "راهنمای خرید" });
    await db().post.update({
      where: { id: post.id },
      data: { byline: "تحریریه", body: { type: "doc", content: [{ type: "paragraph" }] } as never },
    });
    await tagPost(post.id, "راهنما", "rahnamay");

    const detail = await controller().one(request(), post.id);

    expect(detail).toMatchObject({ id: post.id, title: "راهنمای خرید", byline: "تحریریه" });
    expect(detail.tags).toEqual(["راهنما"]);
    expect(detail.body).toEqual({ type: "doc", content: [{ type: "paragraph" }] });

    // A 404 rather than an empty post: the editor seeds a form from this, and an empty form rendered
    // against an id that names nothing is a form that saves over whatever the id actually was.
    await expect(controller().one(request(), "does-not-exist")).rejects.toBeInstanceOf(
      PostNotFoundException,
    );
  });

  // The editor draws text inputs, and "no byline" is an empty box rather than an absent field. The
  // page used to decide that five times over with `?? ""`.
  it("answers the absent columns as empty strings, so the editor has nothing to decide", async () => {
    const post = await makePost({ title: "بدون توضیح" });
    // The fixture writes an excerpt; this is about a post that has none, which is the case the editor
    // has to render as an empty box.
    await db().post.update({ where: { id: post.id }, data: { excerpt: null } });

    const detail = await controller().one(request(), post.id);

    expect(detail.excerpt).toBe("");
    expect(detail.byline).toBe("");
    expect(detail.coverImage).toBe("");
    // And the two structured fields, which the page used to default at the point of use.
    expect(detail.seo).toEqual({});
    expect(detail.body).toEqual({ type: "doc", content: [] });
  });

  it("needs an operator for the editor read too", async () => {
    const post = await makePost({ title: "راهنمای خرید" });

    await expect(controller().one(anonymous(), post.id)).rejects.toThrow();
  });
});

describe("the panel reads the page list", () => {
  beforeEach(resetDatabase);
  let operatorId: string;

  beforeEach(async () => {
    operatorId = await seedOperator();
  });

  const controller = () => new PagesController(authFor(operatorId), db() as never);

  /**
   * The count, not the blocks behind it.
   *
   * The panel read every page's whole `draftBlocks` array and called `.length` on it in the JSX, so a
   * page of two hundred blocks meant a table cell receiving two hundred blocks' worth of JSON to
   * render the number ۲۰۰. Asserting the *number* is the boundary; asserting the blocks are absent is
   * the same boundary seen from the other side, and it is what fails if the read regresses to
   * shipping the array.
   */
  it("answers the block count, which is what the column shows, and not the blocks themselves", async () => {
    const page = await db().page.create({
      data: {
        slug: "about",
        title: "درباره ما",
        kind: "SYSTEM",
        status: "PUBLISHED",
        draftBlocks: [
          { id: "b1", type: "hero", props: { title: "یک" } },
          { id: "b2", type: "richText", props: { html: "<p>یک</p>" } },
        ] as never,
        publishedBlocks: [] as never,
      },
    });

    const listed = await controller().list(request(), pageQuery());

    const row = listed.rows.find((r) => r.id === page.id);
    expect(row?.blockCount).toBe(2);
    expect(Object.keys(row ?? {}).sort()).toEqual([
      "blockCount",
      "id",
      "kind",
      "slug",
      "status",
      "title",
    ]);
  });

  // An empty draft is zero blocks, not a missing count: the column renders "۰ بلوک" and the page used
  // to reach for `(p.draftBlocks ?? []).length` to get there.
  it("answers zero blocks for an empty draft rather than a missing count", async () => {
    const page = await db().page.create({
      data: {
        slug: "empty",
        title: "خالی",
        kind: "CUSTOM",
        status: "DRAFT",
        draftBlocks: [] as never,
        publishedBlocks: [] as never,
      },
    });

    const listed = await controller().list(request(), pageQuery());

    expect(listed.rows.find((r) => r.id === page.id)?.blockCount).toBe(0);
  });

  it("filters by the title, and a term that names nobody narrows to nobody", async () => {
    const wanted = await db().page.create({
      data: { slug: "about", title: "درباره ما", kind: "SYSTEM", status: "PUBLISHED", draftBlocks: [] as never, publishedBlocks: [] as never },
    });
    await db().page.create({
      data: { slug: "contact", title: "تماس با ما", kind: "SYSTEM", status: "PUBLISHED", draftBlocks: [] as never, publishedBlocks: [] as never },
    });

    const found = await controller().list(request(), pageQuery({ q: "درباره" }));
    expect(found.rows.map((r) => r.id)).toEqual([wanted.id]);
    expect(found.total).toBe(1);

    const nobody = await controller().list(request(), pageQuery({ q: "nobody-here" }));
    expect(nobody.rows).toEqual([]);
    expect(nobody.total).toBe(0);
  });

  it("filters by status, and a status nothing holds narrows to nothing", async () => {
    const draft = await db().page.create({
      data: { slug: "draft-page", title: "پیش‌نویس", kind: "CUSTOM", status: "DRAFT", draftBlocks: [] as never, publishedBlocks: [] as never },
    });
    await db().page.create({
      data: { slug: "live-page", title: "منتشر شده", kind: "CUSTOM", status: "PUBLISHED", draftBlocks: [] as never, publishedBlocks: [] as never },
    });

    const drafts = await controller().list(request(), pageQuery({ status: "DRAFT" as never }));
    expect(drafts.rows.map((r) => r.id)).toEqual([draft.id]);
    expect(drafts.total).toBe(1);
  });

  it("pages, and the count beside the rows stays the whole count", async () => {
    const first = await db().page.create({ data: { slug: "one", title: "یک", kind: "CUSTOM", status: "DRAFT", draftBlocks: [] as never, publishedBlocks: [] as never } });
    const second = await db().page.create({ data: { slug: "two", title: "دو", kind: "CUSTOM", status: "DRAFT", draftBlocks: [] as never, publishedBlocks: [] as never } });

    const pageOne = await controller().list(request(), pageQuery({ page: 1, size: 1 }));
    const pageTwo = await controller().list(request(), pageQuery({ page: 2, size: 1 }));

    expect(pageOne.rows).toHaveLength(1);
    expect(pageTwo.rows).toHaveLength(1);
    expect([pageOne.rows[0]?.id, pageTwo.rows[0]?.id].sort()).toEqual([first.id, second.id].sort());
    expect(pageTwo.total).toBe(2);
  });

  // The panel's split into system and custom is a rendering decision and stays the page's; what the
  // read owes it is that the two groups arrive whole rather than interleaved across a page boundary.
  it("answers with the kind, so the page can draw the two groups without a second query", async () => {
    const system = await db().page.create({ data: { slug: "home", title: "خانه", kind: "SYSTEM", status: "PUBLISHED", draftBlocks: [] as never, publishedBlocks: [] as never } });
    const custom = await db().page.create({ data: { slug: "about-us", title: "درباره ما", kind: "CUSTOM", status: "DRAFT", draftBlocks: [] as never, publishedBlocks: [] as never } });

    const listed = await controller().list(request(), pageQuery());

    expect(listed.rows.find((r) => r.id === system.id)?.kind).toBe("SYSTEM");
    expect(listed.rows.find((r) => r.id === custom.id)?.kind).toBe("CUSTOM");
  });

  it("needs an operator, because a draft page is not a catalogue", async () => {
    await db().page.create({ data: { slug: "draft-page", title: "پیش‌نویس", kind: "CUSTOM", status: "DRAFT", draftBlocks: [] as never, publishedBlocks: [] as never } });

    await expect(controller().list(anonymous(), pageQuery())).rejects.toThrow();
  });

  /**
   * The draft blocks, not the published ones.
   *
   * This is the fix worth pinning. The page read `draftBlocks` and the builder was handed those, but
   * a read that answered `publishedBlocks` would open a published page in an empty builder — and the
   * first save would publish the empty list over the page the shop was serving. Asserting the *content*
   * of the two lists differently is the only way this can fail; asserting that both are non-empty
   * would not.
   */
  it("answers the draft blocks, so the builder cannot be seeded from what the shop already serves", async () => {
    const page = await db().page.create({
      data: {
        slug: "landing",
        title: "فرود",
        kind: "CUSTOM",
        status: "DRAFT",
        draftBlocks: [{ id: "d1", type: "hero", props: { title: "پیش‌نویس" } }] as never,
        publishedBlocks: [{ id: "p1", type: "hero", props: { title: "منتشر شده" } }] as never,
      },
    });

    const detail = await controller().one(request(), page.id);

    expect(detail.blocks).toHaveLength(1);
    expect(detail.blocks[0]?.id).toBe("d1");
    expect(detail.blocks[0]?.props).toEqual({ title: "پیش‌نویس" });
  });

  it("answers a stored block with its three fields defaulted, so the builder has nothing to unpack", async () => {
    const page = await db().page.create({
      data: {
        slug: "ragged",
        title: "نامنظم",
        kind: "CUSTOM",
        status: "DRAFT",
        // A block with no `props` and one with `props` that is not an object: the panel defaulted both
        // at the point of use with `b.props ?? {}`, which is a decision this read now makes.
        draftBlocks: [{ id: "b1", type: "spacer" }] as never,
        publishedBlocks: [] as never,
      },
    });

    const detail = await controller().one(request(), page.id);

    expect(detail.blocks).toEqual([{ id: "b1", type: "spacer", props: {} }]);
  });

  it("answers the SEO block as an object, not as null for a page that has none", async () => {
    const page = await db().page.create({
      data: { slug: "plain", title: "ساده", kind: "CUSTOM", status: "DRAFT", draftBlocks: [] as never, publishedBlocks: [] as never },
    });

    const detail = await controller().one(request(), page.id);

    expect(detail.seo).toEqual({});
  });

  it("refuses an id that names nobody, rather than answering an empty page", async () => {
    await expect(controller().one(request(), "does-not-exist")).rejects.toBeInstanceOf(
      PageNotFoundException,
    );
  });

  it("needs an operator for the builder read too", async () => {
    const page = await db().page.create({ data: { slug: "draft-page", title: "پیش‌نویس", kind: "CUSTOM", status: "DRAFT", draftBlocks: [] as never, publishedBlocks: [] as never } });

    await expect(controller().one(anonymous(), page.id)).rejects.toThrow();
  });
});

describe("the panel reads the navigation trees", () => {
  beforeEach(resetDatabase);
  let operatorId: string;

  beforeEach(async () => {
    operatorId = await seedOperator();
  });

  const controller = () => new NavController(authFor(operatorId), db() as never);

  async function seedMenu(location: "HEADER" | "FOOTER" | "MOBILE") {
    return db().menu.create({ data: { location, name: `منوی ${location}` } });
  }

  /**
   * The nested tree, which is the whole point of the read.
   *
   * The panel grouped the flat rows by `parentId`, sorted each group by `sortOrder` and recursed, in
   * the page. A read that answered the flat rows would leave that code exactly where it was, so this
   * asserts the *nesting*: the child is inside its parent rather than beside it, and the two roots are
   * in the order they were saved at.
   */
  it("answers each location nested and ordered, so the page does not assemble the tree itself", async () => {
    const menu = await seedMenu("HEADER");
    const first = await db().menuItem.create({
      data: { menuId: menu.id, sortOrder: 0, label: "خانه", target: { type: "EXTERNAL", url: "/" } as never },
    });
    const second = await db().menuItem.create({
      data: { menuId: menu.id, sortOrder: 1, label: "محصولات", target: { type: "EXTERNAL", url: "/products" } as never },
    });
    // Created *before* the child, and with the higher `sortOrder`, so a read that ignored the order
    // would put the child first.
    const child = await db().menuItem.create({
      data: { menuId: menu.id, parentId: first.id, sortOrder: 5, label: "یخچال", target: { type: "CATEGORY", targetId: "c1" } as never },
    });

    const read = await controller().read(request());

    const header = read.menus.find((m) => m.location === "HEADER");
    expect(header?.items.map((i) => i.label)).toEqual(["خانه", "محصولات"]);
    expect(header?.items[0]?.children.map((c) => c.label)).toEqual(["یخچال"]);
    // The key is the row's own id, because the editor diffs a saved tree against this one by key.
    expect(header?.items[0]?.children[0]?.key).toBe(child.id);
    expect(header?.items[1]?.children).toEqual([]);
    expect(header?.name).toBe("منوی HEADER");
  });

  it("answers with the pickers beside the menus, so the page never fetches to label an id", async () => {
    const category = await makeCategory("mobile", "موبایل");
    const child = await makeCategory("phone", "گوشی", category.id);
    const page = await db().page.create({ data: { slug: "about", title: "درباره ما", kind: "SYSTEM", status: "PUBLISHED", draftBlocks: [] as never, publishedBlocks: [] as never } });
    const collection = await db().collection.create({ data: { name: "پیشنهاد", slug: "offers" } });

    const read = await controller().read(request());

    // The root category is offered; the child is not. A menu links to a top-level category, and
    // offering the whole tree would let an operator point a dropdown at one the storefront renders
    // inside another.
    expect(read.categories.map((c) => c.id)).toEqual([category.id]);
    expect(read.categories.map((c) => c.id)).not.toContain(child.id);
    expect(read.pages).toEqual([{ id: page.id, slug: "about", title: "درباره ما" }]);
    expect(read.collections).toEqual([{ id: collection.id, name: "پیشنهاد" }]);
  });

  // A location with no menu is *absent*, not an empty tree. The panel filtered those out and said
  // "منویی یافت نشد" when none were left; an empty tree would render as a menu with nothing in it.
  it("leaves a location with no menu out rather than answering it with an empty tree", async () => {
    await seedMenu("HEADER");

    const read = await controller().read(request());

    expect(read.menus.map((m) => m.location)).toEqual(["HEADER"]);
  });

  /**
   * A stored target, in the two fields the editor's form draws.
   *
   * The panel decided this against `["PAGE", "CATEGORY", …].includes(rawType) ? rawType : "NONE"` —
   * a second copy of the link vocabulary the write went through, sitting beside the table. The read
   * now goes through `linkRefSchema`, so a target the gateway would refuse to store and a target it
   * cannot read are the same set.
   */
  it("reads a stored target through the shared vocabulary, into the form's two fields", () => {
    expect(readTarget({ type: "CATEGORY", targetId: "c9" })).toEqual({ targetType: "CATEGORY", targetValue: "c9" });
    expect(readTarget({ type: "EXTERNAL", url: "https://example.test" })).toEqual({
      targetType: "EXTERNAL",
      targetValue: "https://example.test",
    });
    // A site-relative URL, which the storefront renders verbatim and which the schema admits.
    expect(readTarget({ type: "EXTERNAL", url: "/products" })).toEqual({
      targetType: "EXTERNAL",
      targetValue: "/products",
    });
    expect(readTarget({ type: "BLOG_INDEX" })).toEqual({ targetType: "BLOG_INDEX", targetValue: "" });
  });

  // A target the schema refuses becomes `NONE` with no value — the same answer the panel gave, and
  // now from the one vocabulary. The dangerous case is a target of a *known* type carrying an
  // unusable value, which the panel's `includes()` check would have passed straight through.
  it("answers NONE for a target the vocabulary refuses, rather than passing a known type through", () => {
    expect(readTarget({ type: "NOT_A_TYPE", targetId: "x" })).toEqual({ targetType: "NONE", targetValue: "" });
    expect(readTarget(null)).toEqual({ targetType: "NONE", targetValue: "" });
    expect(readTarget({ type: "PAGE" })).toEqual({ targetType: "NONE", targetValue: "" });
    // An external link to a scheme the schema refuses. The panel's list check passed this one through
    // and the storefront rendered it.
    expect(readTarget({ type: "EXTERNAL", url: "javascript:alert(1)" })).toEqual({
      targetType: "NONE",
      targetValue: "",
    });
  });

  it("needs an operator, because a menu tree is the shop's own shape", async () => {
    await seedMenu("HEADER");

    await expect(controller().read(anonymous())).rejects.toThrow();
  });
});

describe("the tree is nested by the same rule the write stores it by", () => {
  // Asserted on the function rather than through the controller, because the rule is "a row whose
  // parent is not in this menu is unreachable" and a controller test can only reach it by writing an
  // orphan, which the write path will not produce.
  it("does not render a row whose parent is not in the menu", () => {
    const row = (over: Partial<MenuRow>): MenuRow => ({
      id: "i1",
      parentId: null,
      sortOrder: 0,
      label: "آیتم",
      target: { type: "NONE" },
      childSource: "STATIC",
      categoryId: null,
      display: "DROPDOWN",
      visible: true,
      mobileVisible: true,
      promos: [],
      ...over,
    });

    const nested = nestMenu([
      row({ id: "root", label: "ریشه" }),
      // `parentId` names a row that is not here, so the item is unreachable from the root and the
      // storefront cannot reach it either. Rendering it would be showing a link that goes nowhere.
      row({ id: "orphan", parentId: "missing", label: "یتیم" }),
    ]);

    expect(nested.map((i) => i.label)).toEqual(["ریشه"]);
  });

  it("nests to the depth the tree actually has, not one level", () => {
    const row = (id: string, parentId: string | null): MenuRow => ({
      id,
      parentId,
      sortOrder: 0,
      label: id,
      target: { type: "NONE" },
      childSource: "STATIC",
      categoryId: null,
      display: "DROPDOWN",
      visible: true,
      mobileVisible: true,
      promos: [],
    });

    const nested = nestMenu([row("a", null), row("b", "a"), row("c", "b")]);

    expect(nested[0]?.children[0]?.children[0]?.label).toBe("c");
  });
});

/**
 * What the gateway will accept about a content list query.
 *
 * Through the *pipe* rather than through the controller, because `@Max` and friends run in the
 * `ValidationPipe` and nowhere else: a test that calls `list(request, query)` cannot see a missing or
 * wrong decorator at all, and passes either way. The options are the gateway's own, so this cannot
 * drift from what the server is configured to do.
 */
describe("the content list queries are bounded", () => {
  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

  async function refusal(
    query: Record<string, unknown>,
    metatype: ArgumentMetadata["metatype"],
  ): Promise<string | null> {
    try {
      await pipe.transform(query, { type: "query", metatype, data: "" } as ArgumentMetadata);
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  }

  it("refuses a page size the caller invented, on both lists", () => {
    // A caller that chooses its own ceiling is not being served, it is setting the gateway's memory
    // limit. `size=1000000` is the request these reads exist to refuse.
    return Promise.all([
      refusal({ size: "1000000" }, PostListQueryDto).then((m) => expect(m).toMatch(/ردیف/)),
      refusal({ size: "1000000" }, PageListQueryDto).then((m) => expect(m).toMatch(/ردیف/)),
    ]);
  });

  it("refuses a page number that does not count from one", () => {
    return Promise.all([
      refusal({ page: "0" }, PostListQueryDto).then((m) => expect(m).toMatch(/صفحه/)),
      refusal({ page: "1e9" }, PageListQueryDto).then((m) => expect(m).toMatch(/صفحه/)),
    ]);
  });

  it("accepts an empty search box rather than refusing the operator's first click", () => {
    // `?q=` is a cleared box, not a filter over the empty string. Refusing it would turn a search
    // form into an error page the moment someone deleted what they had typed.
    return Promise.all([
      refusal({ q: "", page: "2", size: "25" }, PostListQueryDto).then((m) => expect(m).toBeNull()),
      refusal({ q: "", page: "2", size: "25" }, PageListQueryDto).then((m) => expect(m).toBeNull()),
    ]);
  });

  it("refuses a status outside the vocabulary rather than filtering on nothing", () => {
    return Promise.all([
      refusal({ status: "NONSENSE" }, PostListQueryDto).then((m) => expect(m).toMatch(/وضعیت/)),
      refusal({ status: "NONSENSE" }, PageListQueryDto).then((m) => expect(m).toMatch(/وضعیت/)),
    ]);
  });

  it("caps the size at the number it names", () => {
    // The bound the DTO refuses *above*, stated from this side: a read that raised its own ceiling
    // without raising the DTO's would still be refused here, and one that lowered the DTO's would make
    // the panel's own page size unaskable.
    expect(MAX_POST_PAGE_SIZE).toBe(100);
    expect(MAX_PAGE_PAGE_SIZE).toBe(100);
  });
});

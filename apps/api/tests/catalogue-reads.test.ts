// The storefront's catalogue reads, as the gateway serves them.
//
// Four reads the storefront used to write for itself — the category tree, the product list, one
// product, the collections — and what is worth pinning is what each of them can quietly stop doing.
// A filter that stops filtering returns a plausible page of the whole catalogue; a 404 that starts
// returning an empty list turns a missing category into a category that looks empty, which is the one
// answer a shopper cannot act on. So the tests here are about boundaries: which rows a filter admits,
// which it refuses, and whether an absent thing is a 404 rather than a list with nothing in it.
//
// The DTO half is here rather than only in `dto-contract.test.ts` because a query DTO's decorators
// run in the global pipe and nowhere else: this suite drives the same pipe `main.ts` builds, so a
// `@Max` that was dropped is a failure here instead of a route that will read the whole catalogue.

import { beforeEach, describe, expect, it } from "vitest";
import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { VALIDATION_PIPE_OPTIONS } from "../src/common/validation.js";
import { GatewayException } from "../src/common/exceptions/gateway.exception.js";
import { CatalogueController } from "../src/catalogue/catalogue.controller.js";
import { CatalogueService } from "../src/catalogue/catalogue.service.js";
import {
  CATALOGUE_PAGE_SIZE,
  CatalogueProductQueryDto,
  CatalogueSortDto,
  COLLECTION_PREVIEW_SIZE,
  SlugParamDto,
} from "../src/catalogue/dto/catalogue.dto.js";
import { CatalogueNotFoundException } from "../src/catalogue/exceptions/catalogue.exception.js";
import { db } from "../src/prisma/index.js";
import { makeCategory, makeProduct, makeVariantOn, resetDatabase } from "./harness.js";

const controller = () => new CatalogueController(new CatalogueService(db() as never));

/** A slug as the pipe would have built it, so a route is exercised with the DTO it declares. */
function slugParam(slug: string): SlugParamDto {
  return Object.assign(new SlugParamDto(), { slug });
}

/** A query as the pipe would have built it, so a DTO's own defaults apply where a caller omits one. */
function productQuery(over: Partial<CatalogueProductQueryDto> = {}): CatalogueProductQueryDto {
  return Object.assign(new CatalogueProductQueryDto(), over);
}

/**
 * The gateway's own exception a read refused with, or a failure: a read that answers is not a
 * refusal, and an error that is not a `GatewayException` is one the error filter would not pass a
 * message through — so both are worth failing on here rather than reading a status off.
 */
async function refusalOf(answer: Promise<unknown>): Promise<GatewayException> {
  const error = await answer.then(
    () => null,
    (raised: Error) => raised,
  );
  if (!error) throw new Error("the read answered where it was supposed to refuse");
  expect(error).toBeInstanceOf(GatewayException);
  return error as GatewayException;
}

const asQuery: ArgumentMetadata = { type: "query", metatype: Object, data: "" };
const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

/** A query string as the pipe receives it, before the DTO's own defaults exist. */
function throughPipe(query: Record<string, unknown>): Promise<CatalogueProductQueryDto> {
  return pipe.transform(query, { ...asQuery, metatype: CatalogueProductQueryDto });
}

async function makeCollection(slug: string, name = slug) {
  return db().collection.create({ data: { slug, name } });
}

async function addToCollection(collectionId: string, productId: string, sortOrder = 0) {
  return db().collectionItem.create({ data: { collectionId, productId, sortOrder } });
}

describe("a shopper reads the category tree", () => {
  beforeEach(resetDatabase);

  it("nests a child under the parent it belongs to, and leaves a root's children empty", async () => {
    const parent = await makeCategory("mvbayl", "موبایل");
    const child = await makeCategory("gvshy", "گوشی", parent.id);
    const other = await makeCategory("jfnh", "جفنگ");

    const tree = await controller().categories();

    const root = tree.roots.find((r) => r.id === parent.id);
    expect(root?.children.map((c) => c.slug)).toEqual(["gvshy"]);
    expect(root?.children[0]?.children).toEqual([]);
    // A child is a node in `all` and not a root of its own, or the filter draws it twice.
    expect(tree.roots.map((r) => r.slug)).not.toContain("gvshy");
    expect(tree.all.map((c) => c.slug).sort()).toEqual(["gvshy", "jfnh", "mvbayl"]);
    expect(tree.all.find((c) => c.id === child.id)?.parentId).toBe(parent.id);
  });

  it("answers with the four columns a navigation draws, and no weight, sort order or SEO blob", async () => {
    // These routes have no session, so every column that leaves them is public. The panel's own
    // category read carries postage weight and counts; a shopper's does not need them and must not
    // be handed them.
    await makeCategory("mvbayl", "موبایل");

    const tree = await controller().categories();

    expect(Object.keys(tree.all[0] ?? {}).sort()).toEqual(["id", "name", "parentId", "slug"]);
  });

  it("keeps the operator's own order, because a category dragged up in the panel must stay up", async () => {
    const first = await makeCategory("a", "اول");
    const second = await makeCategory("b", "دوم");
    await db().category.update({ where: { id: second.id }, data: { sortOrder: 0 } });
    await db().category.update({ where: { id: first.id }, data: { sortOrder: 1 } });

    const tree = await controller().categories();

    expect(tree.roots.map((r) => r.slug)).toEqual(["b", "a"]);
  });
});

describe("a shopper reads a category", () => {
  beforeEach(resetDatabase);

  it("answers with the category the slug names", async () => {
    const category = await makeCategory("mvbayl", "موبایل");

    expect(await controller().category(slugParam("mvbayl"))).toEqual({
      id: category.id,
      name: "موبایل",
      slug: "mvbayl",
      parentId: null,
    });
  });

  // The distinction the storefront's route exists for: an absent category is a 404, and answering a
  // category page with an empty product grid is worse than an error page, because a shopper looking
  // at a shop with nothing in it has no way to tell the shop is broken.
  it("refuses a slug no category holds, with a 404 rather than an empty answer", async () => {
    const error = await refusalOf(controller().category(slugParam("no-such-category")));

    expect(error).toBeInstanceOf(CatalogueNotFoundException);
    expect(error.getStatus()).toBe(404);
  });
});

describe("a shopper reads the product list", () => {
  beforeEach(resetDatabase);

  it("filters by a category and its children, and by nothing else", async () => {
    const parent = await makeCategory("mvbayl", "موبایل");
    const child = await makeCategory("gvshy", "گوشی", parent.id);
    const elsewhere = await makeCategory("jfnh", "جفنگ");
    const inParent = await makeProduct({ name: "در والد", categoryId: parent.id });
    const inChild = await makeProduct({ name: "در فرزند", categoryId: child.id });
    const inElsewhere = await makeProduct({ name: "جای دیگر", categoryId: elsewhere.id });

    const rows = await controller().products(productQuery({ categoryId: parent.id }));

    expect(rows.map((r) => r.id).sort()).toEqual([inParent.id, inChild.id].sort());
    expect(rows.map((r) => r.id)).not.toContain(inElsewhere.id);
  });

  it("does not walk up the tree, because a child page is the child's products", async () => {
    // The subtree rule is "self and children". A read that also reached the parent would put every
    // product in the shop on a phone's page, and it would look correct.
    const parent = await makeCategory("mvbayl", "موبایل");
    const child = await makeCategory("gvshy", "گوشی", parent.id);
    const inParent = await makeProduct({ categoryId: parent.id });
    const inChild = await makeProduct({ categoryId: child.id });

    const rows = await controller().products(productQuery({ categoryId: child.id }));

    expect(rows.map((r) => r.id)).toEqual([inChild.id]);
    expect(rows.map((r) => r.id)).not.toContain(inParent.id);
  });

  it("filters by a collection, and a non-member is not in it", async () => {
    const collection = await makeCollection("offers", "پیشنهاد");
    const member = await makeProduct({ name: "عضو" });
    const stranger = await makeProduct({ name: "ناظر" });
    await addToCollection(collection.id, member.id);

    const rows = await controller().products(productQuery({ collectionId: collection.id }));

    expect(rows.map((r) => r.id)).toEqual([member.id]);
    expect(rows.map((r) => r.id)).not.toContain(stranger.id);
  });

  it("never answers with a draft, because a shopper may not ask for one", async () => {
    await makeProduct({ name: "منتشرشده" });
    await makeProduct({ name: "پیش‌نویس", status: "DRAFT" });

    const rows = await controller().products(productQuery());

    expect(rows.map((r) => r.name)).toEqual(["منتشرشده"]);
  });

  it("searches the name, the brand and the model, and refuses to answer with the rest", async () => {
    await makeProduct({ name: "جارو", brand: "داتیس", categoryId: (await makeCategory()).id });
    const byModel = await makeProduct({ name: "ماشین لباسشویی", brand: "ایکس ویژن" });
    await db().product.update({ where: { id: byModel.id }, data: { model: "WM-900" } });
    const stranger = await makeProduct({ name: "یخچال" });

    const rows = await controller().products(productQuery({ search: "wm-900" }));

    expect(rows.map((r) => r.id)).toEqual([byModel.id]);
    expect(rows.map((r) => r.id)).not.toContain(stranger.id);
  });

  it("answers with as many products as it was asked for, and no more", async () => {
    await makeProduct();
    await makeProduct();
    await makeProduct();

    expect(await controller().products(productQuery({ limit: 2 }))).toHaveLength(2);
    expect(await controller().products(productQuery())).toHaveLength(3);
  });

  it("sorts by the cheapest variant, which is not the order the rows arrive in", async () => {
    const cheap = await makeProduct({ name: "ارزان", price: 100_000 });
    const dear = await makeProduct({ name: "گران", price: 900_000 });

    const rows = await controller().products(
      productQuery({ sort: CatalogueSortDto.PriceAsc, limit: 2 }),
    );

    expect(rows.map((r) => r.id)).toEqual([cheap.id, dear.id]);
  });

  it("prices a product by its sellable variants, so a sold-out cheap variant sets no price", async () => {
    const product = await makeProduct({ name: "جارو", price: 500_000 });
    // The variant that is not in stock and cannot be ordered on backorder.
    await makeVariantOn(product.id, { sku: "sold-out", price: 1_000, stock: 0 });

    const row = (await controller().products(productQuery({ search: "جارو" })))[0];

    expect(row?.price).toBe(500_000);
    expect(row?.maxPrice).toBe(500_000);
    expect(row?.variantCount).toBe(1);
  });

  it("keeps a product nothing can be bought in, and says so rather than hiding it", async () => {
    // A published product with a sold-out variant is still a product of the shop. Dropping it makes
    // the category look empty for a reason the shopper cannot see.
    await makeProduct({ name: "ناموجود", price: 500_000, stock: 0 });

    const rows = await controller().products(productQuery({ search: "ناموجود" }));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ available: false, price: 0, maxPrice: 0, variantCount: 0 });
  });
});

describe("a shopper reads one product", () => {
  beforeEach(resetDatabase);

  it("answers with the page's own questions, and the specification's field name with its value", async () => {
    const category = await makeCategory("jfnh", "جفنگ");
    const product = await makeProduct({ name: "جارو", brand: "داتیس", categoryId: category.id });
    await db().categorySpecField.create({
      data: { categoryId: category.id, name: "توان", type: "number", unit: "وات" },
    });
    const field = await db().categorySpecField.findFirstOrThrow();
    await db().productSpecValue.create({
      data: { productId: product.id, specFieldId: field.id, value: "1800" },
    });
    const detail = await controller().product(slugParam(product.slug));

    expect(detail).toMatchObject({
      slug: product.slug,
      name: "جارو",
      brand: "داتیس",
      categoryId: category.id,
      category: { slug: "jfnh", name: "جفنگ" },
    });
    expect(detail.specValues).toEqual([
      { specFieldId: field.id, value: "1800", specField: { name: "توان" } },
    ]);
    expect(detail.variants).toHaveLength(1);
  });

  it("says a variant cannot be bought, from the stock rather than from the client's arithmetic", async () => {
    const product = await makeProduct({ name: "جارو" });
    const soldOut = await makeVariantOn(product.id, { sku: "empty", stock: 0 });
    const reserved = await makeVariantOn(product.id, { sku: "held", stock: 3, reserved: 3 });
    const backorder = await makeVariantOn(product.id, { sku: "later", stock: 0 });
    await db().variant.update({ where: { id: backorder.id }, data: { allowBackorder: true } });

    const detail = await controller().product(slugParam(product.slug));

    const availableOf = (id: string) => detail.variants.find((v) => v.id === id)?.available;
    expect(availableOf(soldOut.id)).toBe(false);
    // Reserved stock is not stock: this is the check the cart makes, and a page that reported the
    // raw column would offer a variant the order would then refuse.
    expect(availableOf(reserved.id)).toBe(false);
    expect(availableOf(backorder.id)).toBe(true);
  });

  it("refuses a slug no product holds, with a 404 rather than an empty answer", async () => {
    const error = await refusalOf(controller().product(slugParam("no-such-product")));

    expect(error.getStatus()).toBe(404);
  });

  // A draft is a product the operator has not finished. Answering it here is the only way a shopper
  // could reach one, by guessing the slug, and the storefront's own route cannot tell the two apart.
  it("refuses a draft exactly as it refuses an absent product", async () => {
    const draft = await makeProduct({ name: "پیش‌نویس", status: "DRAFT" });

    const error = await refusalOf(controller().product(slugParam(draft.slug)));

    expect(error).toBeInstanceOf(CatalogueNotFoundException);
  });
});

describe("a shopper reads the collections", () => {
  beforeEach(resetDatabase);

  it("answers each collection with its members, in the collection's own order", async () => {
    const first = await makeCollection("a-first");
    const second = await makeCollection("b-second");
    await db().collection.update({ where: { id: second.id }, data: { sortOrder: 0 } });
    await db().collection.update({ where: { id: first.id }, data: { sortOrder: 1 } });
    const later = await makeProduct({ name: "دوم" });
    const earlier = await makeProduct({ name: "اول" });
    await addToCollection(first.id, later.id, 1);
    await addToCollection(first.id, earlier.id, 0);

    const rows = await controller().collections();

    expect(rows.map((row) => row.slug)).toEqual(["b-second", "a-first"]);
    expect(rows[1]?.items.map((item) => item.name)).toEqual(["اول", "دوم"]);
  });

  it("keeps a draft member out of a collection, and the cap counts what is left", async () => {
    // The storefront fetched a collection's products whole, so a collection could publish work the
    // operator had not finished. The eight-member cap is kept; it now counts published members.
    const collection = await makeCollection("offers");
    await addToCollection(
      collection.id,
      (await makeProduct({ name: "پیش‌نویس", status: "DRAFT" })).id,
      0,
    );
    for (let i = 0; i < COLLECTION_PREVIEW_SIZE; i += 1) {
      await addToCollection(collection.id, (await makeProduct({ name: `منتشر ${i}` })).id, i + 1);
    }

    const items = (await controller().collections())[0]?.items ?? [];

    expect(items).toHaveLength(COLLECTION_PREVIEW_SIZE);
    expect(items.map((item) => item.name)).not.toContain("پیش‌نویس");
  });

  it("answers a member as the same card the product list answers, so a collection cannot price differently", async () => {
    const collection = await makeCollection("offers");
    const product = await makeProduct({ name: "جارو", price: 400_000 });
    await addToCollection(collection.id, product.id);

    const [row] = await controller().collections();
    const [listed] = await controller().products(productQuery());

    expect(row?.items[0]).toEqual(listed);
  });

  it("refuses a slug no collection holds, with a 404 rather than an empty answer", async () => {
    const error = await refusalOf(controller().collection(slugParam("no-such-collection")));

    expect(error.getStatus()).toBe(404);
  });

  it("answers a collection the slug names with only what its heading needs", async () => {
    const collection = await makeCollection("offers", "پیشنهاد شگفت‌انگیز");

    expect(await controller().collection(slugParam("offers"))).toEqual({
      id: collection.id,
      name: "پیشنهاد شگفت‌انگیز",
      slug: "offers",
    });
  });
});

describe("what the product list accepts", () => {
  // The pipe is the only place these decorators run, so the assertions are made against the same
  // pipe `main.ts` builds. Called through a controller they would pass with no decorator at all.
  it("applies its own default page size where the caller names none", async () => {
    expect((await throughPipe({})).limit).toBe(CATALOGUE_PAGE_SIZE);
  });

  it("refuses a page size that would read the whole catalogue into one response", async () => {
    const error = await refusalOf(throughPipe({ limit: 5_000 }));

    expect(error.message).toMatch(/تعداد محصولات/);
  });

  it("refuses a sort it does not offer, rather than falling back to one the caller did not ask for", async () => {
    const error = await refusalOf(throughPipe({ sort: "cheapest-ever" }));

    expect(error.message).toMatch(/ترتیب نمایش/);
  });

  it("refuses a filter that is not one, and names it", async () => {
    const error = await refusalOf(throughPipe({ status: "DRAFT" }));

    expect(error.message).toMatch(/status/);
  });

  it("reads a category id that could not be one as a bad request, not as an empty catalogue", async () => {
    const error = await refusalOf(throughPipe({ categoryId: "../../etc/passwd" }));

    expect(error.message).toMatch(/شناسه دسته/);
  });
});

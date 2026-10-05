// The per-product discount rule, as every product read serves it.
//
// The rule used to live twice: inline in the deals read, and at the till. Every other read showed no
// discount at all. What is worth pinning here is the part two copies could disagree about — which
// discount wins, what the percentage cap does to the price, that a scope names products through its
// own id list — asserted through the routes the storefront actually calls rather than against the
// module alone, because a rule that is right in isolation and wrong in a read is still wrong to a
// shopper.

import { beforeEach, describe, expect, it } from "vitest";
import { CatalogueController } from "../src/catalogue/catalogue.controller.js";
import { CatalogueService } from "../src/catalogue/catalogue.service.js";
import {
  CatalogueProductQueryDto,
  SlugParamDto,
} from "../src/catalogue/dto/catalogue.dto.js";
import { ContentService } from "../src/content/content.service.js";
import { db } from "../src/prisma/index.js";
import {
  makeCategory,
  makeDiscount,
  makeProduct,
  makeVariantOn,
  resetDatabase,
} from "./harness.js";

const catalogue = () => new CatalogueController(new CatalogueService(db() as never));
const content = () => new ContentService(db() as never);

function productQuery(over: Partial<CatalogueProductQueryDto> = {}): CatalogueProductQueryDto {
  return Object.assign(new CatalogueProductQueryDto(), over);
}

/** The one card a test is about, by id, rather than the shape of the whole page of rows. */
async function cardFor(id: string) {
  const rows = await catalogue().products(productQuery({ search: undefined, limit: 60 }));
  const card = rows.find((row) => row.id === id);
  if (!card) throw new Error(`product ${id} was not in the listing`);
  return card;
}

describe("a product carries the discount the till would take off it", () => {
  beforeEach(resetDatabase);

  it("shows a percentage discount on the card, formatted once, at the capped price", async () => {
    const product = await makeProduct({ price: 100_000 });
    await makeDiscount({ productIds: [product.id], type: "PERCENT", value: 20 });

    const card = await cardFor(product.id);

    expect(card.discount).toEqual({
      label: "۲۰٪",
      discountedPrice: 80_000,
      endsAt: null,
    });
  });

  it("honours the percentage cap, because a capped discount a card ignores overstates every offer", async () => {
    const product = await makeProduct({ price: 100_000 });
    await makeDiscount({
      productIds: [product.id],
      type: "PERCENT",
      value: 50,
      maxAmount: 10_000,
    });

    const card = await cardFor(product.id);

    // The rule still reads 50٪ — what it *takes* is what the cap allows.
    expect(card.discount?.discountedPrice).toBe(90_000);
  });

  it("gives the product the discount taking the most Toman off it, not the first one listed", async () => {
    const product = await makeProduct({ price: 100_000 });
    await makeDiscount({ productIds: [product.id], type: "PERCENT", value: 10 });
    await makeDiscount({ productIds: [product.id], type: "FIXED", value: 15_000 });

    const card = await cardFor(product.id);

    expect(card.discount?.discountedPrice).toBe(85_000);
  });

  it("leaves a product nothing names without a discount, not with somebody else's", async () => {
    const discounted = await makeProduct({ price: 100_000 });
    const stranger = await makeProduct({ price: 100_000 });
    await makeDiscount({ productIds: [discounted.id], value: 20 });

    expect((await cardFor(discounted.id)).discount).not.toBeNull();
    expect((await cardFor(stranger.id)).discount).toBeNull();
  });

  it("ignores a coupon, which a shopper cannot see well enough to advertise", async () => {
    const product = await makeProduct({ price: 100_000 });
    await makeDiscount({ productIds: [product.id], value: 20, mode: "COUPON" });

    expect((await cardFor(product.id)).discount).toBeNull();
  });

  it("ignores a discount whose window has closed", async () => {
    const product = await makeProduct({ price: 100_000 });
    await makeDiscount({
      productIds: [product.id],
      value: 20,
      startsAt: new Date(Date.now() - 7_200_000),
      endsAt: new Date(Date.now() - 3_600_000),
    });

    expect((await cardFor(product.id)).discount).toBeNull();
  });

  it("reaches a product through its category, the way the till reaches a cart through one", async () => {
    const category = await makeCategory("washers", "ماشین لباسشویی");
    const other = await makeCategory("fridges", "یخچال");
    const inScope = await makeProduct({ categoryId: category.id, price: 100_000 });
    const elsewhere = await makeProduct({ categoryId: other.id, price: 100_000 });
    await makeDiscount({
      productIds: [],
      scope: "CATEGORIES",
      categoryIds: [category.id],
      value: 15,
    });

    expect((await cardFor(inScope.id)).discount?.discountedPrice).toBe(85_000);
    expect((await cardFor(elsewhere.id)).discount).toBeNull();
  });

  it("reaches a product through a collection it is a member of", async () => {
    const collection = await db().collection.create({
      data: { slug: "offers", name: "پیشنهادها" },
    });
    const member = await makeProduct({ price: 100_000 });
    await db().collectionItem.create({
      data: { collectionId: collection.id, productId: member.id, sortOrder: 0 },
    });
    await makeDiscount({
      productIds: [],
      scope: "COLLECTIONS",
      collectionIds: [collection.id],
      value: 25,
    });

    expect((await cardFor(member.id)).discount?.discountedPrice).toBe(75_000);
  });

  it("prices every variant on the product page under the same winning rule", async () => {
    const product = await makeProduct({ price: 100_000 });
    const dearer = await makeVariantOn(product.id, { price: 150_000, colorName: "نوک مدادی" });
    await makeDiscount({ productIds: [product.id], value: 20 });

    const detail = await catalogue().product(
      Object.assign(new SlugParamDto(), { slug: product.slug }),
    );
    const lead = await db().variant.findFirstOrThrow({
      where: { productId: product.id },
      orderBy: { price: "asc" },
    });

    expect(detail.discount?.label).toBe("۲۰٪");
    expect(detail.discount?.variantPrices).toEqual({
      [lead.id]: 80_000,
      [dearer.id]: 120_000,
    });
    // The lead variant is priced by the card's own rule, and both reads agree.
    expect((await cardFor(product.id)).discount?.discountedPrice).toBe(80_000);
  });

  it("carries no discount on the product page when nothing targets the product", async () => {
    const product = await makeProduct({ price: 100_000 });

    const detail = await catalogue().product(
      Object.assign(new SlugParamDto(), { slug: product.slug }),
    );

    expect(detail.discount).toBeNull();
  });

  it("feeds the deals section from the same resolution as the cards", async () => {
    const product = await makeProduct({ price: 100_000 });
    await makeDiscount({ productIds: [product.id], value: 20 });

    const deals = await content().activeDeals(6);

    expect(deals).toHaveLength(1);
    expect(deals[0]?.discountedPrice).toBe(80_000);
    expect(deals[0]?.label).toBe("۲۰٪");
    // The deal's own product carries the identical field the listing serves.
    expect(deals[0]?.product.discount).toEqual({
      label: "۲۰٪",
      discountedPrice: 80_000,
      endsAt: null,
    });
  });
});

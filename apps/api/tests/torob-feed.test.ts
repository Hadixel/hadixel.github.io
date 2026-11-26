import { beforeEach, describe, expect, it } from "vitest";
import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { VALIDATION_PIPE_OPTIONS } from "../src/common/validation.js";
import { db } from "../src/prisma/index.js";
import { StorefrontController } from "../src/storefront/storefront.controller.js";
import { StorefrontService } from "../src/storefront/storefront.service.js";
import {
  TOROB_DEFAULT_PAGE_SIZE,
  TOROB_MAX_PAGE_SIZE,
  TorobProductsQueryDto,
} from "../src/storefront/dto/storefront.dto.js";
import {
  makeCategory,
  makeDiscount,
  makeProduct,
  makeVariantOn,
  resetDatabase,
} from "./harness.js";

const controller = () => new StorefrontController(new StorefrontService(db()));

function torobQuery(over: Partial<TorobProductsQueryDto> = {}): TorobProductsQueryDto {
  return Object.assign(new TorobProductsQueryDto(), over);
}

describe("GET /storefront/torob/products", () => {
  beforeEach(resetDatabase);

  it("returns empty paginated structure when no published products exist", async () => {
    await makeProduct({ slug: "draft-only", status: "DRAFT" });

    const res = await controller().torobProducts(torobQuery());

    expect(res).toEqual({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
  });

  it("emits single-variant and multi-variant items with black-first variant order, discounts, availability, and absolute URLs", async () => {
    const category = await makeCategory("ovens", "فر توکار");

    const older = await makeProduct({
      slug: "older-hood",
      name: "هود قدیمی",
      categoryId: category.id,
      price: 2_000_000,
      stock: 4,
    });
    const olderVariants = await db().variant.findMany({ where: { productId: older.id } });
    await db().variant.update({
      where: { id: olderVariants[0].id },
      data: { images: ["https://cdn.example.com/hood.jpg"] },
    });

    const newer = await makeProduct({
      slug: "new-oven",
      name: "فر توکار جدید",
      categoryId: category.id,
      price: 10_000_000,
      stock: 0,
    });
    const whiteVariant = await db().variant.findFirstOrThrow({ where: { productId: newer.id } });
    await db().variant.update({
      where: { id: whiteVariant.id },
      data: {
        colorName: "سفید",
        colorCode: "#FFFFFF",
        allowBackorder: false,
        images: ["/products/oven-white.jpg"],
      },
    });
    const blackVariant = await makeVariantOn(newer.id, {
      colorName: "مشکی",
      sku: "OVEN-BLK",
      price: 12_000_000,
      stock: 5,
      reserved: 2,
    });
    await db().variant.update({
      where: { id: blackVariant.id },
      data: { colorCode: "#1C1917", images: ["/products/oven-black.jpg"] },
    });

    await makeDiscount({
      productIds: [newer.id],
      type: "PERCENT",
      value: 10,
    });

    const res = await controller().torobProducts(torobQuery());

    expect(res.count).toBe(3);
    expect(res.next).toBeNull();
    expect(res.previous).toBeNull();

    // Newest product comes first, with black variant before white variant, then single-variant older product.
    expect(res.results).toEqual([
      {
        title: "فر توکار جدید - رنگ مشکی",
        product_id: blackVariant.id,
        page_url: "https://kmodern.ir/product/new-oven",
        price: 10_800_000,
        old_price: 12_000_000,
        availability: "instock",
        image_url: "https://kmodern.ir/products/oven-black.jpg",
        category_name: "فر توکار",
      },
      {
        title: "فر توکار جدید - رنگ سفید",
        product_id: whiteVariant.id,
        page_url: "https://kmodern.ir/product/new-oven",
        price: 9_000_000,
        old_price: 10_000_000,
        availability: "outofstock",
        image_url: "https://kmodern.ir/products/oven-white.jpg",
        category_name: "فر توکار",
      },
      {
        title: "هود قدیمی",
        product_id: olderVariants[0].id,
        page_url: "https://kmodern.ir/product/older-hood",
        price: 2_000_000,
        old_price: null,
        availability: "instock",
        image_url: "https://cdn.example.com/hood.jpg",
        category_name: "فر توکار",
      },
    ]);
  });

  it("treats fully reserved stock without backorder as outofstock and backorderable stock as instock", async () => {
    const category = await makeCategory("sinks", "سینک");
    const product = await makeProduct({
      slug: "sink-a",
      name: "سینک استیل",
      categoryId: category.id,
      price: 5_000_000,
      stock: 2,
    });
    const reservedOut = await db().variant.findFirstOrThrow({ where: { productId: product.id } });
    await db().variant.update({
      where: { id: reservedOut.id },
      data: { colorName: "استیل", reserved: 2, allowBackorder: false },
    });
    const backorderable = await makeVariantOn(product.id, {
      colorName: "مشکی",
      sku: "SINK-BLK",
      price: 5_500_000,
      stock: 0,
      reserved: 0,
    });
    await db().variant.update({
      where: { id: backorderable.id },
      data: { colorCode: "#000000", allowBackorder: true },
    });

    const res = await controller().torobProducts(torobQuery());

    expect(res.results.map((r) => ({ id: r.product_id, availability: r.availability }))).toEqual([
      { id: backorderable.id, availability: "instock" },
      { id: reservedOut.id, availability: "outofstock" },
    ]);
  });

  it("paginates items with next and previous links", async () => {
    const category = await makeCategory("hobs", "اجاق گاز");
    await makeProduct({ slug: "hob-1", name: "اجاق ۱", categoryId: category.id });
    await makeProduct({ slug: "hob-2", name: "اجاق ۲", categoryId: category.id });
    await makeProduct({ slug: "hob-3", name: "اجاق ۳", categoryId: category.id });

    const page1 = await controller().torobProducts(torobQuery({ page: 1, limit: 2 }));
    expect(page1.count).toBe(3);
    expect(page1.results).toHaveLength(2);
    expect(page1.previous).toBeNull();
    expect(page1.next).toBe("https://kmodern.ir/torob/products?page=2&limit=2");

    const page2 = await controller().torobProducts(torobQuery({ page: 2, limit: 2 }));
    expect(page2.count).toBe(3);
    expect(page2.results).toHaveLength(1);
    expect(page2.next).toBeNull();
    expect(page2.previous).toBe("https://kmodern.ir/torob/products?page=1&limit=2");
  });
});

describe("TorobProductsQueryDto validation pipe", () => {
  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
  const metadata: ArgumentMetadata = { type: "query", metatype: TorobProductsQueryDto, data: "" };

  it("applies defaults and accepts valid page and max limit", async () => {
    await expect(pipe.transform({}, metadata)).resolves.toMatchObject({
      page: 1,
      limit: TOROB_DEFAULT_PAGE_SIZE,
    });
    await expect(
      pipe.transform({ page: "2", limit: String(TOROB_MAX_PAGE_SIZE) }, metadata),
    ).resolves.toMatchObject({
      page: 2,
      limit: TOROB_MAX_PAGE_SIZE,
    });
  });

  it("rejects out-of-range page/limit and undeclared query fields", async () => {
    await expect(pipe.transform({ page: "0" }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ limit: "0" }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ limit: "201" }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ page: "abc" }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ extra: "1" }, metadata)).rejects.toThrow();
  });
});

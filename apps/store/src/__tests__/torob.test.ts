import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import robots from "@/app/robots";
import {
  buildProductJsonLd,
  buildProductMetadata,
} from "@/catalogue/lib/torob";
import type { ProductDetail } from "@/lib/queries";

const GATEWAY_BASE = "http://gateway.test:3102";

function stubResponse(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  const text = body === undefined ? "" : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  } as unknown as Response;
}

const sampleProduct: ProductDetail = {
  id: "prod-1",
  slug: "datees-oven-203",
  name: "فر توکار داتیس مدل ۲۰۳",
  brand: "داتیس",
  model: "203",
  description: "فر توکار برقی با ۱۰ برنامه پخت",
  features: ["گریل برقی", "فن کانوکشن"],
  categoryId: "cat-1",
  category: { id: "cat-1", name: "فر توکار", slug: "built-in-oven" },
  variants: [
    {
      id: "var-black",
      colorName: "مشکی",
      colorCode: "black",
      price: 20_000_000,
      stock: 5,
      reserved: 1,
      allowBackorder: false,
      images: ["/media/oven-black.jpg"],
      sku: "DT-203-BLK",
      available: true,
    },
    {
      id: "var-white",
      colorName: "سفید",
      colorCode: "white",
      price: 19_000_000,
      stock: 0,
      reserved: 0,
      allowBackorder: false,
      images: ["/media/oven-white.jpg"],
      sku: "DT-203-WHT",
      available: false,
    },
  ],
  specValues: [],
  discount: {
    label: "۱۰٪",
    endsAt: null,
    variantPrices: {
      "var-black": 18_000_000,
      "var-white": 17_100_000,
    },
  },
};

describe("GET /torob/products route", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = GATEWAY_BASE;
    process.env.NEXT_PUBLIC_BASE_URL = "https://kmodern.ir";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_BASE_URL;
  });

  it("proxies /storefront/torob/products and normalizes storefront URLs", async () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://shop.test";
    fetchMock.mockResolvedValue(
      stubResponse({
        count: 3,
        next: "https://kmodern.ir/torob/products?page=2&limit=2",
        previous: null,
        results: [
          {
            title: "فر توکار داتیس مدل ۲۰۳ - رنگ مشکی",
            product_id: "var-black",
            page_url: "https://kmodern.ir/product/datees-oven-203",
            price: 18_000_000,
            old_price: 20_000_000,
            availability: "instock",
            image_url: "/media/oven-black.jpg",
            category_name: "فر توکار",
          },
          {
            title: "هود",
            product_id: "var-hood",
            page_url: "/product/hood-1",
            price: 5_000_000,
            old_price: null,
            availability: "outofstock",
            image_url: "https://cdn.example.com/hood.jpg",
            category_name: "هود",
          },
        ],
      }),
    );

    const { GET } = await import("@/app/torob/products/route");
    const res = await GET(new NextRequest("https://shop.test/torob/products?page=1&limit=2"));

    expect(res.status).toBe(200);
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toBe(`${GATEWAY_BASE}/storefront/torob/products?page=1&limit=2`);

    const body = await res.json();
    expect(body).toEqual({
      count: 3,
      next: "https://shop.test/torob/products?page=2&limit=2",
      previous: null,
      results: [
        {
          title: "فر توکار داتیس مدل ۲۰۳ - رنگ مشکی",
          product_id: "var-black",
          page_url: "https://shop.test/product/datees-oven-203",
          price: 18_000_000,
          old_price: 20_000_000,
          availability: "instock",
          image_url: "https://shop.test/media/oven-black.jpg",
          category_name: "فر توکار",
        },
        {
          title: "هود",
          product_id: "var-hood",
          page_url: "https://shop.test/product/hood-1",
          price: 5_000_000,
          old_price: null,
          availability: "outofstock",
          image_url: "https://cdn.example.com/hood.jpg",
          category_name: "هود",
        },
      ],
    });
  });

  it("rejects invalid page or limit with 400 without calling the gateway", async () => {
    const { GET } = await import("@/app/torob/products/route");

    for (const url of [
      "https://kmodern.ir/torob/products?page=0",
      "https://kmodern.ir/torob/products?page=abc",
      "https://kmodern.ir/torob/products?limit=0",
      "https://kmodern.ir/torob/products?limit=201",
    ]) {
      const res = await GET(new NextRequest(url));
      expect(res.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 when the gateway is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const { GET } = await import("@/app/torob/products/route");

    const res = await GET(new NextRequest("https://kmodern.ir/torob/products"));
    expect(res.status).toBe(502);
  });
});

describe("robots.txt rules", () => {
  it("allows /torob/ and /product/ while keeping /api/ and account routes disallowed", () => {
    const config = robots();
    const rule = Array.isArray(config.rules) ? config.rules[0] : config.rules;

    expect(rule.allow).toEqual(expect.arrayContaining(["/", "/torob/", "/product/"]));
    expect(rule.disallow).toEqual(expect.arrayContaining(["/api/", "/account", "/orders", "/order/"]));
  });
});

describe("Product page metadata and JSON-LD", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = GATEWAY_BASE;
    process.env.NEXT_PUBLIC_BASE_URL = "https://kmodern.ir";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_BASE_URL;
  });

  it("builds Torob meta tags, OpenGraph, and canonical URL for the default black-first discounted variant", () => {
    const meta = buildProductMetadata(sampleProduct, "https://kmodern.ir");

    expect(meta.title).toBe("فر توکار داتیس مدل ۲۰۳ | خانه مدرن");
    expect(meta.description).toBe("فر توکار برقی با ۱۰ برنامه پخت");
    expect(meta.alternates?.canonical).toBe("https://kmodern.ir/product/datees-oven-203");
    expect(meta.openGraph).toMatchObject({
      title: "فر توکار داتیس مدل ۲۰۳",
      description: "فر توکار برقی با ۱۰ برنامه پخت",
      url: "https://kmodern.ir/product/datees-oven-203",
      type: "website",
      images: [{ url: "https://kmodern.ir/media/oven-black.jpg", alt: "فر توکار داتیس مدل ۲۰۳" }],
    });
    expect(meta.other).toEqual({
      product_id: "var-black",
      product_name: "فر توکار داتیس مدل ۲۰۳",
      product_price: "18000000",
      product_old_price: "20000000",
      availability: "instock",
      "product:price:amount": "18000000",
      "product:price:currency": "IRT",
      "product:availability": "instock",
    });
  });

  it("omits product_old_price and marks outofstock when default variant has no discount and no stock", () => {
    const oosProduct: ProductDetail = {
      ...sampleProduct,
      discount: null,
      variants: [sampleProduct.variants[1]],
    };

    const meta = buildProductMetadata(oosProduct, "https://kmodern.ir");

    expect(meta.other).toEqual({
      product_id: "var-white",
      product_name: "فر توکار داتیس مدل ۲۰۳",
      product_price: "19000000",
      availability: "outofstock",
      "product:price:amount": "19000000",
      "product:price:currency": "IRT",
      "product:availability": "outofstock",
    });
    expect(meta.other).not.toHaveProperty("product_old_price");
  });

  it("builds Schema.org/Product JSON-LD matching the default variant", () => {
    const jsonLd = buildProductJsonLd(sampleProduct, "https://kmodern.ir");

    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "فر توکار داتیس مدل ۲۰۳",
      image: ["https://kmodern.ir/media/oven-black.jpg"],
      description: "فر توکار برقی با ۱۰ برنامه پخت",
      sku: "DT-203-BLK",
      brand: {
        "@type": "Brand",
        name: "داتیس",
      },
      offers: {
        "@type": "Offer",
        url: "https://kmodern.ir/product/datees-oven-203",
        priceCurrency: "IRT",
        price: 18_000_000,
        availability: "https://schema.org/InStock",
      },
    });
  });

  it("wires generateMetadata on ProductPage to the gateway product read", async () => {
    fetchMock.mockResolvedValue(stubResponse(sampleProduct));
    const { generateMetadata } = await import("@/app/product/[slug]/page");

    const meta = await generateMetadata({ params: Promise.resolve({ slug: "datees-oven-203" }) });

    expect(meta.other).toMatchObject({
      product_id: "var-black",
      product_price: "18000000",
      product_old_price: "20000000",
      availability: "instock",
    });
  });
});

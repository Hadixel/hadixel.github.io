import type { Metadata } from "next";
import { z } from "zod";
import { gateway } from "@/lib/gateway";
import type { ProductDetail } from "@/lib/queries";

const DEFAULT_BASE_URL = "https://kmodern.ir";

export const TorobProductItemSchema = z.object({
  title: z.string(),
  product_id: z.string(),
  page_url: z.string(),
  price: z.number(),
  old_price: z.number().nullable(),
  availability: z.enum(["instock", "outofstock"]),
  image_url: z.string().nullable(),
  category_name: z.string(),
});

export type TorobProductItem = z.infer<typeof TorobProductItemSchema>;

export const TorobProductsResponseSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(TorobProductItemSchema),
});

export type TorobProductsResponse = z.infer<typeof TorobProductsResponseSchema>;

/** Canonical public origin for the storefront without a trailing slash. */
export function storeBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/**
 * Resolve relative paths (or default-origin URLs when overridden by `NEXT_PUBLIC_BASE_URL`)
 * against the active storefront origin, leaving third-party absolute URLs unchanged.
 */
export function absolutizeStoreUrl(url: string, baseUrl: string = storeBaseUrl()): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  if (url.startsWith("/")) return `${normalizedBase}${url}`;
  if (url.startsWith(`${DEFAULT_BASE_URL}/`)) {
    return `${normalizedBase}${url.slice(DEFAULT_BASE_URL.length)}`;
  }
  if (/^https?:\/\//i.test(url)) return url;
  return `${normalizedBase}/${url}`;
}

/** Rewrite a feed pagination URL so it always points to `${baseUrl}/torob/products?...`. */
function rewriteFeedPageUrl(url: string | null, baseUrl: string): string | null {
  if (!url) return null;
  const parsed = new URL(url, baseUrl);
  return `${baseUrl}/torob/products${parsed.search}`;
}

/** Fetch the paginated Torob product feed from the gateway and normalize public URLs. */
export async function getTorobProducts(opts: {
  page?: number;
  limit?: number;
} = {}): Promise<TorobProductsResponse> {
  const client = await gateway();
  const body = await client.get<unknown>("/storefront/torob/products", {
    query: { page: opts.page, limit: opts.limit },
  });
  const parsed = TorobProductsResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("پاسخ درگاه با ساختار مورد انتظار نخواند.");
  }

  const baseUrl = storeBaseUrl();
  return {
    count: parsed.data.count,
    next: rewriteFeedPageUrl(parsed.data.next, baseUrl),
    previous: rewriteFeedPageUrl(parsed.data.previous, baseUrl),
    results: parsed.data.results.map((item) => ({
      ...item,
      page_url: absolutizeStoreUrl(item.page_url, baseUrl),
      image_url: item.image_url ? absolutizeStoreUrl(item.image_url, baseUrl) : null,
    })),
  };
}

/**
 * Derive the default (black-first) variant's price, discount, availability, image, and canonical
 * URL so product metadata, JSON-LD, and `ProductBuyBox` always agree.
 */
export function resolveProductTorobSnapshot(product: ProductDetail, baseUrl: string = storeBaseUrl()) {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const defaultVariant = product.variants[0] ?? null;
  const isAvailable = defaultVariant
    ? defaultVariant.allowBackorder || defaultVariant.stock - defaultVariant.reserved > 0
    : false;
  const discounted =
    defaultVariant &&
    product.discount &&
    typeof product.discount.variantPrices[defaultVariant.id] === "number"
      ? product.discount.variantPrices[defaultVariant.id]
      : null;
  const hasDiscount =
    defaultVariant !== null && discounted !== null && discounted < defaultVariant.price;
  const finalPrice = defaultVariant ? (hasDiscount ? discounted : defaultVariant.price) : 0;
  const oldPrice = defaultVariant && hasDiscount ? defaultVariant.price : null;
  const rawImage =
    defaultVariant?.images[0] ??
    product.variants.find((variant) => variant.images.length > 0)?.images[0] ??
    null;
  const imageUrl = rawImage ? absolutizeStoreUrl(rawImage, normalizedBase) : null;
  const pageUrl = `${normalizedBase}/product/${product.slug}`;
  const description =
    product.description?.trim() ||
    `${product.name} - ${product.brand} ${product.model} در فروشگاه خانه مدرن`;
  const availability: "instock" | "outofstock" = isAvailable ? "instock" : "outofstock";

  return {
    defaultVariant,
    isAvailable,
    finalPrice,
    oldPrice,
    imageUrl,
    pageUrl,
    description,
    availability,
  };
}

/** Build Next.js Metadata including OpenGraph and Torob product meta tags for a product page. */
export function buildProductMetadata(
  product: ProductDetail,
  baseUrl: string = storeBaseUrl(),
): Metadata {
  const snap = resolveProductTorobSnapshot(product, baseUrl);
  const other: Record<string, string> = {
    product_name: product.name,
    availability: snap.availability,
    "product:availability": snap.availability,
  };

  if (snap.defaultVariant) {
    other.product_id = snap.defaultVariant.id;
    other.product_price = String(snap.finalPrice);
    other["product:price:amount"] = String(snap.finalPrice);
    other["product:price:currency"] = "IRT";
    if (snap.oldPrice !== null) {
      other.product_old_price = String(snap.oldPrice);
    }
  }

  return {
    title: `${product.name} | خانه مدرن`,
    description: snap.description,
    alternates: {
      canonical: snap.pageUrl,
    },
    openGraph: {
      title: product.name,
      description: snap.description,
      url: snap.pageUrl,
      type: "website",
      ...(snap.imageUrl ? { images: [{ url: snap.imageUrl, alt: product.name }] } : {}),
    },
    other,
  };
}

/** Build Schema.org/Product JSON-LD matching the product page's default variant. */
export function buildProductJsonLd(product: ProductDetail, baseUrl: string = storeBaseUrl()) {
  const snap = resolveProductTorobSnapshot(product, baseUrl);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(snap.imageUrl ? { image: [snap.imageUrl] } : {}),
    description: snap.description,
    ...(snap.defaultVariant?.sku ? { sku: snap.defaultVariant.sku } : {}),
    brand: {
      "@type": "Brand",
      name: product.brand,
    },
    ...(snap.defaultVariant
      ? {
          offers: {
            "@type": "Offer",
            url: snap.pageUrl,
            priceCurrency: "IRT",
            price: snap.finalPrice,
            availability: snap.isAvailable
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          },
        }
      : {}),
  };
}

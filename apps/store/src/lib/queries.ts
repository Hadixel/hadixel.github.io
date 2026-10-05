// Catalog query helpers shared by storefront pages.
//
// Every one of these used to open the data tier itself. They are now one line each over a gateway
// read, and that is the entire reason this file still exists: twelve modules import these names, and
// they all still do.
//
// The exported names and signatures are unchanged on purpose. The reads answer the same shapes these
// functions returned, so a page that called `getPublishedProducts` still gets product cards and knows
// nothing about how they were fetched. That is the difference between a client and a second
// application: the arguments and the answers are the same, and the rules behind them now have one home.
//
// Two functions are gone rather than migrated, and both were dead: `getSettingsMap` and
// `getPublishedPage` had no callers. A helper nobody calls is not a seam, it is a second answer to a
// question that is now asked in one place.

import { gateway } from "@/lib/gateway";
import { GatewayError } from "@kmodern/transport/client";
import type { CategorySummary } from "@/types";

export interface CategoryNode extends CategorySummary {
  children: CategoryNode[];
}

export interface PublishedProduct {
  id: string;
  slug: string;
  name: string;
  brand: string;
  model: string;
  category: { id: string; name: string; slug: string };
  price: number;
  maxPrice: number;
  available: boolean;
  image: string | null;
  variantCount: number;
  dots: Array<{
    id: string;
    colorName: string;
    colorCode: string | null;
    images: string[];
    price: number;
  }>;
  /** The gateway's price cut for this card, or none. `label` is already formatted (۲۰٪ or an
      amount), so no renderer appends a sign to it. */
  discount: { label: string; discountedPrice: number; endsAt: string | null } | null;
}

export type PublishedProductList = PublishedProduct[];

/* ---------- content and product detail ---------- */

/**
 * Restated from the gateway's own DTOs rather than imported from them.
 *
 * Not a shortcut avoided but a boundary: the gateway is an app, and a client that imported a type from
 * one would be depending on the app it is supposed to be a client of. One side of every wire contract
 * has to restate it; this is the storefront's side.
 */
export interface PostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  /** ISO 8601. A `Date` crosses JSON as a string, and the page formats it for the reader. */
  publishAt: string | null;
}

export interface PostDetail extends PostSummary {
  byline: string | null;
  /** The document, with every product mention already resolved by the gateway. */
  body: unknown;
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  brand: string;
  model: string;
  description: string | null;
  features: string[];
  categoryId: string;
  category: { id: string; name: string; slug: string };
  variants: ProductDetailVariant[];
  specValues: ProductSpecValue[];
  /** The gateway's price cut for this product: the label for the badge, and every variant id at its
      discounted price. `null` when nothing here is discounted; a variant id absent from the record
      is simply not discounted. */
  discount: { label: string; endsAt: string | null; variantPrices: Record<string, number> } | null;
}

export interface ProductDetailVariant {
  id: string;
  colorName: string;
  colorCode: string | null;
  price: number;
  stock: number;
  reserved: number;
  allowBackorder: boolean;
  images: string[];
  sku: string;
  /**
   * Whether this variant can be bought at all, worked out by the gateway.
   *
   * It was `stock - reserved` in the page, which is wrong in one direction and right in another: a
   * backorderable variant with nothing in stock is sellable, and that arithmetic said it was not.
   */
  available: boolean;
}

export interface ProductSpecValue {
  specFieldId: string;
  value: string;
  specField: { name: string };
}

export interface ActiveDeal {
  product: PublishedProduct;
  label: string;
  discountedPrice: number;
  endsAt: string | null;
}

/** The category tree the sidebar and the mobile filter draw. */
export async function getCategoryTree(): Promise<{ roots: CategoryNode[]; all: CategorySummary[] }> {
  const client = await gateway();
  return client.get<{ roots: CategoryNode[]; all: CategorySummary[] }>("/catalogue/categories");
}

/**
 * Published product cards, filtered.
 *
 * The category filter still covers the whole two-level subtree and never upward — that decision moved
 * into the gateway with the query, rather than being re-made here. `limit` is sent when the caller
 * gave one and omitted otherwise, so the gateway's own default applies rather than a second default
 * written beside it.
 */
export async function getPublishedProducts(opts?: {
  categoryId?: string;
  collectionId?: string;
  search?: string;
  limit?: number;
  sort?: "newest" | "price-asc" | "price-desc";
}): Promise<PublishedProductList> {
  const params = new URLSearchParams();
  if (opts?.categoryId) params.set("categoryId", opts.categoryId);
  if (opts?.collectionId) params.set("collectionId", opts.collectionId);
  if (opts?.search) params.set("search", opts.search);
  if (opts?.sort) params.set("sort", opts.sort);
  if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
  const query = params.toString();
  const client = await gateway();
  return client.get<PublishedProductList>(`/catalogue/products${query ? `?${query}` : ""}`);
}

/**
 * One product, or `null` when there is no such *published* product.
 *
 * A draft is a 404 here, not a hidden card. The old read filtered on `status: PUBLISHED` in the
 * `where`, so a draft and a product that did not exist were both `null` here — but the page then
 * rendered a blank instead of a 404, and a guessable slug was a way to see unpublished work.
 */
export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const client = await gateway();
  try {
    return await client.get<ProductDetail>(
      `/catalogue/products/${encodeURIComponent(slug)}`,
    );
  } catch (error) {
    if (error instanceof GatewayError && error.statusCode === 404) return null;
    throw error;
  }
}

export async function getCollections() {
  const client = await gateway();
  return client.get<Array<{ id: string; name: string; slug: string; items: PublishedProduct[] }>>(
    "/catalogue/collections",
  );
}

/** One published post, or `null`. A draft is a 404 here for the same reason a draft product is. */
export async function getPublishedPost(slug: string): Promise<PostDetail | null> {
  const client = await gateway();
  try {
    return await client.get<PostDetail>(`/storefront/posts/${encodeURIComponent(slug)}`);
  } catch (error) {
    if (error instanceof GatewayError && error.statusCode === 404) return null;
    throw error;
  }
}

export async function getPublishedPosts(limit = 12) {
  const client = await gateway();
  const answer = await client.get<{ posts: PostSummary[] }>(`/storefront/posts?limit=${limit}`);
  return answer.posts;
}

/**
 * The shop's current offers, priced by the gateway.
 *
 * This was a discount calculation in the storefront: the same filter, the same "best offer wins"
 * comparison and the same cap rule, re-implemented in a second process. A cap the gateway applied and
 * the storefront did not would show a shopper one price and charge another.
 */
export async function getActiveDeals(limit = 6): Promise<ActiveDeal[]> {
  const client = await gateway();
  return client.get<ActiveDeal[]>(`/content/deals?limit=${limit}`);
}

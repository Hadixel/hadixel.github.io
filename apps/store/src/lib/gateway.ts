// The storefront's gateway client, and the home read model.
//
// The transport lives in `packages/transport` and owns everything about making a request: the base URL,
// the credential, the timeout, the empty-body case and the error type. What is left here is the shape of
// the home read, because that is the storefront's business and not the transport's.
//
// There is deliberately no hand-written `fetch` in this file and no base-URL default. The version that
// was here resolved the URL, invented a timeout, parsed the body and built its own error class; all of
// that is now one implementation both clients share, which is the only reason a Persian message from
// the gateway reaches a shopper whichever route the failure came through.
//
// The wire types duplicate the gateway's `content/dto/home.dto.ts`. That duplication is a known deviation
// from §5.1 and it is deliberate: the gateway cannot export them without the client importing an app,
// which §5.1 forbids outright, so one of the two sides has to restate the contract.

import type { Block, ComponentProps } from "@kmodern/contracts";
import { GatewayError, type ApiClient, type RequestOptions } from "@kmodern/transport/client";
import { createServerApiClient, gatewayBaseUrl } from "@kmodern/transport/next";

export { GatewayError };
export type { ApiClient, RequestOptions };
export { gatewayBaseUrl };

/**
 * A client bound to the caller's session.
 *
 * Built per call rather than held in a module variable, because the credential is the caller's cookie.
 * A client built once at import time would capture whatever the first request's caller had, and a
 * captured credential outlives the session it belonged to.
 */
export async function gateway(): Promise<ApiClient> {
  return createServerApiClient({ baseUrl: gatewayBaseUrl() });
}

/* ---------- the home read, as the gateway returns it ---------- */

export interface ResolvedBlock extends Omit<Block, "props"> {
  props: Record<string, unknown>;
  data: BlockData;
}

export interface HomeVariant {
  id: string;
  colorName: string;
  colorCode: string | null;
  images: string[];
  price: number;
}

export interface HomeProduct {
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
  dots: HomeVariant[];
  /** The gateway's price cut for this card, or none. `label` is already formatted (۲۰٪ or an
      amount), so no renderer appends a sign to it. */
  discount: { label: string; discountedPrice: number; endsAt: string | null } | null;
}

export interface HomeDeal {
  product: HomeProduct;
  label: string;
  discountedPrice: number;
  endsAt: string | null;
}

export interface HomePost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
}

export interface HomeCategoryTile {
  href: string;
  name: string;
}

export interface ResolvedLink {
  href: string;
  newTab: boolean;
}

export interface ComparisonTable {
  products: { id: string; name: string }[];
  fields: { name: string; values: string[] }[];
}

export interface BlockData {
  product?: HomeProduct | null;
  cta?: ResolvedLink | null;
  link?: ResolvedLink | null;
  products?: HomeProduct[];
  deals?: HomeDeal[];
  tiles?: HomeCategoryTile[];
  links?: (ResolvedLink | null)[];
  pairLinks?: (ResolvedLink | null)[];
  posts?: HomePost[];
  comparison?: ComparisonTable;
}

export interface HomeResponse {
  blocks: ResolvedBlock[];
  products: HomeProduct[];
  deals: HomeDeal[];
}

/** Re-exported so the renderer reads its props from one import. */
export type { ComponentProps };

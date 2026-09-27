import type { Block, ComponentProps } from "@kmodern/schema";

/**
 * The storefront's gateway client.
 *
 * TEMPORARY, and deliberately small. Ticket 13 replaces this file with `packages/transport`, which
 * owns base-URL resolution, the auth header, JSON encoding, empty responses and the typed error —
 * the full `createApiClient(tokenName)` shape §10 describes. Nothing may grow here that transport
 * would then have to own twice: this is a placeholder for one call site, not a second transport.
 *
 * It exists at all because the home page has to stop reading the database, and the only way to stop
 * is to give it something else to read from.
 */

/**
 * The wire shapes the home read returns.
 *
 * These duplicate the gateway's `content/dto/home.dto.ts`. That duplication is a known deviation
 * from §5.1 and it is deliberate: the gateway cannot export them without the client importing an app,
 * which §5.1 forbids outright, so one of the two sides has to restate the contract. The long-term
 * home for it is `packages/transport` in ticket 13, which owns the types once there are two real
 * callers — this file is the first caller, and it is a placeholder for one call site.
 *
 * `props` is deliberately typed from `@kmodern/schema` rather than copied: the block prop shapes are
 * the CMS's, the store already depends on that package, and only the resolved `data` is new.
 */
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

/**
 * A gateway failure, carrying the one envelope every error comes back in.
 *
 * The status code is kept because a 404 and a 500 are different bugs, and collapsing them into one
 * message is how a misconfigured route looks like a database outage.
 */
export class GatewayError extends Error {
  readonly statusCode: number;
  readonly timestamp: string | null;

  constructor(message: string, statusCode: number, timestamp: string | null) {
    super(message);
    this.name = "GatewayError";
    this.statusCode = statusCode;
    this.timestamp = timestamp;
  }
}

const DEFAULT_BASE_URL = "http://127.0.0.1:3102";

/**
 * A read that must not hang a page render.
 *
 * A refused connection fails immediately, but a process that is listening and not answering — a
 * wedged gateway, a proxy holding the socket — would otherwise leave the shopper on a spinner with
 * no error to show. The timeout turns that into the same reported failure as a stopped gateway.
 */
const READ_TIMEOUT_MS = 8_000;

export function gatewayBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  return (configured && configured !== "" ? configured : DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/**
 * One GET against the gateway, returning the parsed body.
 *
 * `cache: "no-store"` is set explicitly even though an uncached `fetch` is the default: this is a
 * live read of stock and orders, and a cached home page is a home page showing a sold-out product
 * as available. Being explicit also keeps the intent if the app later turns on Cache Components,
 * where the default changes.
 */
export async function gatewayGet<T>(path: string): Promise<T> {
  const url = `${gatewayBaseUrl()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
  } catch (cause) {
    // A transport failure has no envelope, so it is reported in the same shape with the status the
    // client would have had to invent otherwise: 0 meaning "the gateway was never reached".
    throw new GatewayError(
      `gateway unreachable at ${url}: ${cause instanceof Error ? cause.message : String(cause)}`,
      0,
      null,
    );
  }

  const text = await response.text();
  const body: unknown = text === "" ? null : safeParse(text);

  if (!response.ok) {
    const envelope = asEnvelope(body);
    throw new GatewayError(
      envelope?.message ?? `gateway returned ${response.status} for ${path}`,
      envelope?.statusCode ?? response.status,
      envelope?.timestamp ?? null,
    );
  }
  return body as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asEnvelope(
  body: unknown,
): { message: string; statusCode: number; timestamp: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const candidate = body as { message?: unknown; statusCode?: unknown; timestamp?: unknown };
  if (typeof candidate.message !== "string" || typeof candidate.statusCode !== "number") {
    return null;
  }
  return {
    message: candidate.message,
    statusCode: candidate.statusCode,
    timestamp: typeof candidate.timestamp === "string" ? candidate.timestamp : null,
  };
}

import { z } from "zod";
import { GatewayError, gateway } from "@/lib/gateway";

/**
 * Reading a category or a collection by slug, and telling "no such thing" from "cannot tell".
 *
 * This is `gateway-page.ts`'s distinction applied to the catalogue, and it is the same distinction:
 * a 404 from the gateway means the row is absent and the route should render Next's not-found, while
 * a transport failure or a 500 means the row may well be there. Answering "not found" to an outage
 * turns a five-minute gateway blip into a category full of dead links that look deliberate — and
 * worse, into an empty product grid, which reads as a shop with nothing in it rather than as a
 * broken page.
 *
 * The three outcomes are returned rather than thrown so a caller cannot conflate them by forgetting
 * a check, and so this is testable without rendering a page.
 */

/** The prefix the gateway serves the public catalogue under. One string, so a path cannot drift. */
const CATALOGUE = "/catalogue";

/**
 * A category, as the storefront's navigation draws it.
 *
 * Parsed rather than asserted. The wire types are restated here for the reason `gateway.ts` restates
 * the home read's: the gateway cannot export its types without this app importing an app, so one side
 * has to hold the contract — and a contract this app parses is a contract it cannot quietly
 * misread. Four fields, and no postage weight or sort position: a category row on a public route
 * carries what a link renders, and the panel's management columns are not on a public route.
 */
export const CategorySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  parentId: z.string().nullable(),
});

export type CategorySummary = z.infer<typeof CategorySummarySchema>;

/** A collection by slug, for the page whose heading it is. */
export const CollectionSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

export type CollectionSummary = z.infer<typeof CollectionSummarySchema>;

/** One variant's colour dot, as a product card swaps through it. */
export const CatalogueVariantDotSchema = z.object({
  id: z.string(),
  colorName: z.string(),
  colorCode: z.string().nullable(),
  images: z.array(z.string()),
  price: z.number(),
});

export type CatalogueVariantDot = z.infer<typeof CatalogueVariantDotSchema>;

/**
 * A product as a card and a listing row draw it.
 *
 * `price` and `maxPrice` are the smallest and largest *sellable* variant and `available` says whether
 * any variant is sellable at all. The gateway decided all three from a variant list this app never
 * sees, so a card cannot price a product from a sold-out variant and two listings cannot disagree
 * about what it costs.
 */
export const CatalogueProductSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  brand: z.string(),
  model: z.string(),
  category: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  price: z.number(),
  maxPrice: z.number(),
  available: z.boolean(),
  image: z.string().nullable(),
  variantCount: z.number(),
  dots: z.array(CatalogueVariantDotSchema),
});

export type CatalogueProduct = z.infer<typeof CatalogueProductSchema>;

export type CategoryLookup =
  | { kind: "ok"; category: CategorySummary }
  | { kind: "missing" }
  | { kind: "unavailable"; reason: string };

export type CollectionLookup =
  | { kind: "ok"; collection: CollectionSummary }
  | { kind: "missing" }
  | { kind: "unavailable"; reason: string };

/** The sentence a page's error boundary shows when the gateway answered with something unreadable. */
const UNREADABLE = "پاسخ درگاه با ساختار مورد انتظار نخواند.";

/**
 * A three-way read of one row by slug.
 *
 * One function rather than two because the two differ only in the path and in the schema they parse,
 * and a copy of this logic is a copy that can be fixed in one place and left broken in the other.
 *
 * `slug` is a parameter and not part of the path built here only so the caller cannot be tempted to
 * interpolate it: it is encoded exactly once, below, and a slug cannot become a path.
 */
async function readBySlug<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<{ kind: "ok"; value: T } | { kind: "missing" } | { kind: "unavailable"; reason: string }> {
  try {
    const client = await gateway();
    const body = await client.get<unknown>(path);
    const parsed = schema.safeParse(body);
    return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "unavailable", reason: UNREADABLE };
  } catch (error) {
    if (error instanceof GatewayError && error.statusCode === 404) return { kind: "missing" };
    if (error instanceof GatewayError) return { kind: "unavailable", reason: error.message };
    throw error;
  }
}

/** One category by slug, told apart from a gateway that is not answering. */
export async function lookupCategory(slug: string): Promise<CategoryLookup> {
  const read = await readBySlug(`${CATALOGUE}/categories/${encodeURIComponent(slug)}`, CategorySummarySchema);
  return read.kind === "ok" ? { kind: "ok", category: read.value } : read;
}

/** One collection by slug, told apart from a gateway that is not answering. */
export async function lookupCollection(slug: string): Promise<CollectionLookup> {
  const read = await readBySlug(
    `${CATALOGUE}/collections/${encodeURIComponent(slug)}`,
    CollectionSummarySchema,
  );
  return read.kind === "ok" ? { kind: "ok", collection: read.value } : read;
}

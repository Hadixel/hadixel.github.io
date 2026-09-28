// Importing what the operator reviewed, which the gateway now applies.
//
// This route used to be the importer: it held the vocabulary tables, the slug rule, the
// publish-requires-a-price rule and the transaction, and it wrote to the database through a data tier
// the panel imported directly. It also wrote its audit line itself, after the import had committed,
// inside a `try/catch` that logged the failure and returned success anyway — so a catalogue nobody
// could account for was reported as a completed import. All of that is in `apps/api/src/scraper` now,
// where the transaction includes the line that records it.
//
// What is left here is the part that genuinely cannot move. The scrape ran in this process, its
// results are files in `packages/scraper/out`, and the images were materialised into the media store
// by the process that owns it. So this route still resolves the operator's selection against the
// current snapshot, still prepares the images, and still refuses a selection made against a catalogue
// that has since changed — and then asks the gateway to write. The edits go across as the operator's
// review, unmerged, because applying them is a rule and the rule now belongs where it cannot be
// skipped.
//
// The origin check is the one in `@/lib/origin`, not a copy of it: this file used to define its own,
// and the three definitions in the scraper routes were byte-identical for the same reason the media
// route's is not.

import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { scraperJobs } from "@/lib/scraper-jobs";
import { prepareScrapedImages } from "@/lib/scraper-images";
import { sameOrigin } from "@/lib/origin";
import { fromGateway } from "@/lib/gateway";
import type { ScraperCatalogEdit, ScraperCatalogItem } from "@/lib/scraper-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * An import of a hundred products is a hundred round trips' worth of work, and the transport's
 * default timeout is sized for a page read. A timeout here would abandon a transaction that is still
 * open and tell the operator the import failed when it is about to succeed.
 */
const IMPORT_TIMEOUT_MS = 10 * 60_000;

interface ImportResult {
  products: number;
  variants: number;
  images: number;
  imageErrors: number;
  status: "DRAFT" | "PUBLISHED";
}

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * The item as the gateway's import route declares it.
 *
 * Written out field by field rather than sent whole, because the gateway's DTO is a whitelist: a
 * field the importer has no use for is one it should never receive, and the ones the scraper records
 * for its own reasons — the download paths, the timestamps, the best-seller flag — are exactly that.
 */
function forImport(item: ScraperCatalogItem) {
  return {
    _id: item._id,
    slug: item.slug,
    name: item.name,
    brand: item.brand,
    category: item.category,
    subCategory: item.subCategory,
    colors: item.colors,
    price: item.price,
    priceByColor: item.priceByColor,
    priceCurrency: item.priceCurrency,
    priceFetchedAt: item.priceFetchedAt,
    priceInStock: item.priceInStock,
    priceSourceId: item.priceSourceId,
    priceSourceUrl: item.priceSourceUrl,
    description: item.description,
    features: item.features,
    specs: item.specs,
  };
}

/**
 * The operator's review, as the gateway reads it.
 *
 * A list of `{slug, …}` rather than a record keyed by slug, because a record's keys cannot be
 * decorated: the gateway would either strip every edit or refuse the whole body, and the rule about
 * which fields may be edited would have to stay a set inside the gateway instead of being a whitelist
 * the pipe applies.
 */
function forGateway(entries: [string, ScraperCatalogEdit][]) {
  return entries.map(([slug, edit]) => ({ slug, ...edit }));
}

/** Where each prepared image ended up, per variant. The key format is the image module's. */
function preparedImageList(prepared: { byVariant: Map<string, string[]> }) {
  return [...prepared.byVariant].map(([key, images]) => {
    // `scraper-images.ts` keys by slug and colour joined with U+0000, written as an escape because a
    // literal NUL does not survive being written into a source file.
    const separator = key.indexOf("\u0000");
    return { slug: key.slice(0, separator), color: key.slice(separator + 1), images };
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return errorResponse(auth.status === 401 ? "unauthorized" : "password_change_required", auth.status);
  const ctx = auth.ctx;
  if (ctx.admin.role !== "OWNER") return errorResponse("forbidden", 403);
  if (!sameOrigin(request)) return errorResponse("invalid_origin", 403);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return errorResponse("invalid_body", 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return errorResponse("invalid_json", 400);
  }

  if (!Array.isArray(body.slugs) || body.slugs.some((slug) => typeof slug !== "string")) {
    return errorResponse("invalid_slugs", 400);
  }
  const slugs = [...new Set(body.slugs as string[])];
  if (!slugs.length || slugs.length > 500) return errorResponse("invalid_selection", 400);
  if (typeof body.catalogRevision !== "string" || !body.catalogRevision) return errorResponse("invalid_catalog_revision", 400);
  if (body.publish !== undefined && typeof body.publish !== "boolean") return errorResponse("invalid_publish", 400);
  if (
    body.edits !== undefined &&
    (!body.edits || typeof body.edits !== "object" || Array.isArray(body.edits))
  ) return errorResponse("invalid_edits", 400);
  const publish = body.publish === true;
  if (scraperJobs.isRunning()) return errorResponse("scrape_in_progress", 409);
  const snapshot = await scraperJobs.getCatalogSnapshot();
  if (snapshot.revision !== body.catalogRevision) return errorResponse("catalog_changed", 409);
  const catalog = snapshot.items;
  const catalogBySlug = new Map(catalog.map((item) => [item.slug, item]));
  const missing = slugs.filter((slug) => !catalogBySlug.has(slug));
  if (missing.length) return errorResponse("scraped_results_changed", 409);
  const selected = slugs.map((slug) => catalogBySlug.get(slug)!);
  if (!selected.length) return errorResponse("no_scraped_results", 409);
  if (!scraperJobs.beginImport()) return errorResponse("import_in_progress", 409);

  try {
    // The images go out before the request does, because a variant row must never carry the address
    // of a file that does not exist yet. The counts travel with them: a download that failed and kept
    // its original remote address still contributed a URL, so counting URLs would report a success
    // that did not happen.
    const prepared = await prepareScrapedImages(selected);
    const rawEdits = (body.edits ?? {}) as Record<string, ScraperCatalogEdit>;

    const result = await fromGateway<ImportResult>(
      (client) =>
        client.post<ImportResult>(
          "/scraper/import",
          {
            items: selected.map(forImport),
            edits: forGateway(Object.entries(rawEdits)),
            preparedImages: preparedImageList(prepared),
            preparedImageStats: { ready: prepared.ready, errors: prepared.errors },
            publish,
          },
          { timeoutMs: IMPORT_TIMEOUT_MS },
        ),
      "محصولات وارد شدند.",
    );

    if (!result.ok) {
      return errorResponse(result.error, 409);
    }
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "وارد کردن محصولات ناموفق بود";
    return errorResponse(message, 409);
  } finally {
    scraperJobs.endImport();
  }
}

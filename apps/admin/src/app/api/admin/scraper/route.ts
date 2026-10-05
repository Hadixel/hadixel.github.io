// Running a scrape, and watching one run.
//
// The scrape is this process's work: the pipeline, its cache and its output files all live here, and
// the image bytes it downloads are served back out of this route. None of that is database work, so
// none of it belongs behind the gateway, which is the one process that talks to Postgres and has no
// business fetching a manufacturer's catalogue.
//
// What moved is the audit trail. This route used to open the panel's own data tier and write
// `SCRAPER_STARTED` and `SCRAPER_CANCEL_REQUESTED` itself, each in a `try/catch` that logged the
// failure and carried on — so a scrape nobody could account for was reported as a scrape somebody
// had started. The lines are the gateway's now, written through the one `writeAudit` every sensitive
// mutation uses, and a failure to write one is reported rather than swallowed.
//
// The origin check below is the one in `@/lib/origin`. This file, and the other two scraper routes,
// each defined a byte-identical copy of it; a check written out three times is a check maintained
// three times, and the copies can only agree by accident. The check itself is unchanged and still
// runs on both mutating verbs: an operator's cookie is `SameSite=lax`, and lax still sends it on a
// top-level cross-site POST, which is the shape a cross-site form submission has.

import { NextResponse } from "next/server";
import type { ScrapeFilters } from "@kmodern/scraper-core";
import { requireAdminApi } from "@/auth/lib/auth";
import { scraperJobs } from "@/scraper/lib/scraper-jobs";
import { sameOrigin } from "@/lib/origin";
import { fromGateway } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

async function authorize() {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return {
      response: errorResponse(
        auth.status === 401 ? "unauthorized" : "password_change_required",
        auth.status,
      ),
    } as const;
  }
  if (auth.ctx.admin.role !== "OWNER") {
    return { response: errorResponse("forbidden", 403) } as const;
  }
  return { ctx: auth.ctx } as const;
}



export async function GET(request: Request) {
  const auth = await authorize();
  if ("response" in auth) return auth.response;

  const params = new URL(request.url).searchParams;
  const image = params.get("image");
  if (image !== null) {
    const separator = image.lastIndexOf(":");
    const slug = separator >= 0 ? image.slice(0, separator) : "";
    const index = Number(image.slice(separator + 1));
    if (!slug || !Number.isInteger(index)) return errorResponse("invalid_image", 400);
    try {
      const file = await scraperJobs.readImage(slug, index);
      if (!file) return errorResponse("image_not_found", 404);
      return new NextResponse(new Uint8Array(file.body), {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": `inline; filename="${file.filename}"`,
          "Content-Type": file.contentType,
        },
      });
    } catch {
      return errorResponse("image_unavailable", 404);
    }
  }

  const download = params.get("download");
  if (download) {
    try {
      const file = await scraperJobs.readOutput(download);
      if (!file) return errorResponse("output_not_found", 404);
      return new NextResponse(new Uint8Array(file.body), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="${file.filename}"`,
          "Content-Type": "application/json; charset=utf-8",
        },
      });
    } catch {
      return errorResponse("output_unavailable", 404);
    }
  }

  if (params.get("view") === "catalog") {
    const snapshot = await scraperJobs.getCatalogSnapshot({ publicView: true });
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  }

  // The in-flight product list. It lives on the job, not in the status snapshot below, so the poll
  // the panel makes every 1.5s stays the size it was; only a caller asking for the live view pays for
  // the rows, and `jobId` tells it whose run they belong to.
  if (params.get("view") === "live") {
    return NextResponse.json(scraperJobs.getLive(), {
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json(scraperJobs.get(), {
    headers: { "Cache-Control": "no-store" },
  });
}

type MultiFilterKey = "manufacturer" | "website" | "category" | "subCategory" | "color";
const MULTI_FILTER_KEYS: MultiFilterKey[] = ["manufacturer", "website", "category", "subCategory", "color"];

function parseMultiFilterValue(value: unknown): string[] | null {
  if (value === undefined || value === null || value === "") return [];
  const rawValues = Array.isArray(value) ? value : [value];
  if (rawValues.length > 50) return null;
  const values: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawValues) {
    if (typeof raw !== "string" || raw.length > 200) return null;
    const text = raw.trim();
    if (!text || text === "all") continue;
    const key = text.toLocaleLowerCase("en");
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(text);
  }
  return values;
}

function parseFilters(value: unknown): ScrapeFilters | null {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const filters: ScrapeFilters = {};
  for (const key of ["search", ...MULTI_FILTER_KEYS] as const) {
    const raw = input[key];
    if (key === "search") {
      if (raw === undefined || raw === null || raw === "") continue;
      if (typeof raw !== "string" || raw.length > 200) return null;
      const text = raw.trim();
      if (text && text !== "all") filters.search = text;
      continue;
    }
    const values = parseMultiFilterValue(raw);
    if (!values) return null;
    if (values.length) (filters as Record<MultiFilterKey, string[]>)[key] = values;
  }
  if (input.price !== undefined && input.price !== null && input.price !== "") {
    if (input.price !== "all" && input.price !== "priced" && input.price !== "missing") return null;
    if (input.price !== "all") filters.price = input.price;
  }
  if (input.content !== undefined && input.content !== null && input.content !== "") {
    if (input.content !== "all" && input.content !== "with-images" && input.content !== "without-images" && input.content !== "with-specs") return null;
    if (input.content !== "all") filters.content = input.content;
  }
  if (input.sort !== undefined && input.sort !== null && input.sort !== "") {
    if (input.sort !== "all" && input.sort !== "newest" && input.sort !== "name" && input.sort !== "price-high" && input.sort !== "price-low") return null;
    if (input.sort !== "all") filters.sort = input.sort;
  }
  return filters;
}

export async function POST(request: Request) {
  const auth = await authorize();
  if ("response" in auth) return auth.response;
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

  const source = typeof body.source === "string" ? body.source : "all";
  const cache = body.cache === undefined ? true : body.cache;
  const downloadImages = body.downloadImages === undefined ? true : body.downloadImages;
  const priceLookup = body.priceLookup === undefined ? true : body.priceLookup;
  if (typeof cache !== "boolean") return errorResponse("invalid_cache", 400);
  if (typeof downloadImages !== "boolean") return errorResponse("invalid_download_images", 400);
  if (typeof priceLookup !== "boolean") return errorResponse("invalid_price_lookup", 400);
  const filters = parseFilters(body.filters);
  if (!filters) return errorResponse("invalid_filters", 400);

  let limit: number | undefined;
  if (body.limit !== undefined && body.limit !== null && body.limit !== "") {
    if (typeof body.limit !== "number" && typeof body.limit !== "string") {
      return errorResponse("invalid_limit", 400);
    }
    limit = Number(body.limit);
  }

  let snapshot;
  try {
    snapshot = scraperJobs.start({ source, limit, cache, downloadImages, priceLookup, filters });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SCRAPE_IN_PROGRESS") return errorResponse("scrape_in_progress", 409);
    if (message === "IMPORT_IN_PROGRESS") return errorResponse("import_in_progress", 409);
    if (message === "UNKNOWN_SOURCE" || message === "INVALID_LIMIT") {
      return errorResponse(message.toLowerCase(), 400);
    }
    return errorResponse("start_failed", 500);
  }


  const recorded = await fromGateway<{ recorded: true }>(
    (client) =>
      client.post("/scraper/actions", {
        action: "SCRAPER_STARTED",
        entityId: snapshot.id,
        meta: { source, limit: limit ?? null, cache, downloadImages, priceLookup, filters },
      }),
    "شروع اسکرپ ثبت شد.",
  );
  // Reported, not swallowed, and the job is deliberately not cancelled to compensate.
  //
  // The old code logged the failure and returned 202, so a scrape with nobody recorded as having
  // started it looked exactly like a recorded one — and the comment above it called that the right
  // trade, on the grounds that the job would be orphaned. Cancelling a scrape the operator asked for
  // in order to tidy its paperwork destroys the work to protect the record of it, and the record is
  // the smaller loss. The job runs; the operator is told the trail is incomplete.
  if (!recorded.ok) return errorResponse(recorded.error, 500);

  return NextResponse.json(snapshot, {
    status: 202,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function DELETE(request: Request) {
  const auth = await authorize();
  if ("response" in auth) return auth.response;
  if (!sameOrigin(request)) return errorResponse("invalid_origin", 403);

  const snapshot = scraperJobs.cancel();
  if (snapshot.status === "cancelling") {
    // The same rule as the start: written by the gateway through the one audit helper, and a failure
    // to write it reported rather than logged and forgotten. A cancellation cannot be taken back
    // either — the job has already been told to stop — so this is a record of an action rather than
    // a line to join to a transaction.
    const recorded = await fromGateway<{ recorded: true }>(
      (client) =>
        client.post("/scraper/actions", {
          action: "SCRAPER_CANCEL_REQUESTED",
          entityId: snapshot.id,
        }),
      "درخواست لغو اسکرپ ثبت شد.",
    );
    if (!recorded.ok) return errorResponse(recorded.error, 500);
  }
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}

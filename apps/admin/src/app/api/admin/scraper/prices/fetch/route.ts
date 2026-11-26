// The second step: prices for the scraped products an operator selected.
//
// A scrape reads manufacturer pages and carries no price. This route is where a price arrives
// from — the Datees Shop API, matched to the selected products by model, written into the review
// snapshot so the import that follows has one. The work is file and HTTP work in this process,
// exactly like the pipeline and the XLSX price list: it is not the gateway's, and nothing here
// touches the database.
//
// The audit line is the gateway's, as in the other two scraper routes. A price applied to a
// catalogue with nobody recorded as having applied it is a change nobody can account for, and the
// line is written through the one `writeAudit` every sensitive mutation uses, with no `try/catch`
// to swallow a failure.
//
// The origin check is the one in `@/lib/origin`. This file used to be a fourth copy of the same
// five lines.

import { NextResponse } from "next/server";
import { requireAdminApi } from "@/auth/lib/auth";
import { scraperJobs } from "@/scraper/lib/scraper-jobs";
import { sameOrigin } from "@/lib/origin";
import { fromGateway } from "@/lib/gateway";
import type { DateesPriceFetchReport } from "@kmodern/scraper-core";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The same cap the import route puts on a selection: one operator, one review pass. */
const MAX_SELECTION = 500;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
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
  if (!slugs.length || slugs.length > MAX_SELECTION) return errorResponse("invalid_selection", 400);
  if (slugs.some((slug) => !SLUG_PATTERN.test(slug))) return errorResponse("invalid_slugs", 400);
  if (typeof body.catalogRevision !== "string" || !/^[a-f0-9]{64}$/.test(body.catalogRevision)) {
    return errorResponse("catalog_revision_required", 400);
  }

  // The same refusal the import route makes: repricing a snapshot a run has since replaced would
  // write a price onto a product the operator has not looked at.
  if (scraperJobs.isRunning()) return errorResponse("scrape_in_progress", 409);

  let report: DateesPriceFetchReport;
  try {
    report = await scraperJobs.fetchDateesPrices({
      slugs,
      expectedRevision: body.catalogRevision,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "IMPORT_IN_PROGRESS") return errorResponse("import_in_progress", 409);
    if (message === "CATALOG_CHANGED") return errorResponse("catalog_changed", 409);
    console.error("scraper price fetch failed", error);
    return errorResponse("price_fetch_failed", 422);
  }

  // Only a change gets a line: a fetch that matched nothing wrote nothing, and recording it as a
  // mutation would fill the trail with requests that changed no catalogue.
  if (report.matched > 0) {
    const recorded = await fromGateway<{ recorded: true }>(
      (client) =>
        client.post("/scraper/actions", {
          action: "SCRAPER_PRICES_FETCHED",
          meta: {
            requested: report.requested,
            matched: report.matched,
            unmatched: report.unmatched,
            skipped: report.skipped,
            sourceId: report.sourceId,
          },
        }),
      "دریافت قیمت ثبت شد.",
    );
    if (!recorded.ok) return errorResponse(recorded.error, 500);
  }

  return NextResponse.json({ mode: "fetch", report }, { headers: { "Cache-Control": "no-store" } });
}

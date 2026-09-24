import { NextResponse } from "next/server";
import { db } from "@kmodern/db";
import { getAdminUser } from "@/lib/auth";
import { scraperJobs } from "@/lib/scraper-jobs";
import { importScrapedCatalog, applyScraperCatalogEdits } from "@/lib/scraper-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]
    .trim();
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const ctx = await getAdminUser();
  if (!ctx) return errorResponse("unauthorized", 401);
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
    const importItems = applyScraperCatalogEdits(selected, (body.edits ?? {}) as Record<string, unknown>);
    const result = await importScrapedCatalog(importItems, publish);
    try {
      await db().adminAuditLog.create({
        data: {
          adminUserId: ctx.admin.id,
          action: "SCRAPER_IMPORTED",
          entityType: "SCRAPER",
          meta: {
            slugs: importItems.map((item) => item.slug),
            edited: Object.keys((body.edits ?? {}) as Record<string, unknown>).length,
            products: result.products,
            variants: result.variants,
            images: result.images,
            imageErrors: result.imageErrors,
            status: result.status,
            ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
        },
      });
    } catch (auditError) {
      console.error("scraper import audit write failed", auditError);
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "وارد کردن محصولات ناموفق بود";
    return errorResponse(message, 409);
  } finally {
    scraperJobs.endImport();
  }
}

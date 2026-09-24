import { NextResponse } from "next/server";
import { db } from "@kmodern/db";
import { getAdminUser } from "@/lib/auth";
import { scraperJobs } from "@/lib/scraper-jobs";
import { importScrapedCatalog } from "@/lib/scraper-import";

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
  const publish = body.publish === true;
  const catalog = await scraperJobs.getCatalog();
  const selected = catalog.filter((item) => slugs.includes(item.slug));
  if (!selected.length) return errorResponse("no_scraped_results", 409);

  try {
    const result = await importScrapedCatalog(selected, publish);
    await db().adminAuditLog.create({
      data: {
        adminUserId: ctx.admin.id,
        action: "SCRAPER_IMPORTED",
        entityType: "SCRAPER",
        meta: {
          slugs: selected.map((item) => item.slug),
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
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "وارد کردن محصولات ناموفق بود";
    return errorResponse(message, 409);
  }
}

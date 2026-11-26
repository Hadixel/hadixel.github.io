import { NextResponse } from "next/server";
import { requireAdminApi } from "@/auth/lib/auth";
import { scraperJobs } from "@/scraper/lib/scraper-jobs";
import { sameOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return errorResponse(
      auth.status === 401 ? "unauthorized" : "password_change_required",
      auth.status,
    );
  }
  if (auth.ctx.admin.role !== "OWNER") {
    return errorResponse("forbidden", 403);
  }
  if (!sameOrigin(request)) {
    return errorResponse("invalid_origin", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_json", 400);
  }

  if (!body || typeof body !== "object") {
    return errorResponse("invalid_payload", 400);
  }

  const { url, brand, limit } = body as { url?: unknown; brand?: unknown; limit?: unknown };

  if (typeof url !== "string" || !url.trim()) {
    return errorResponse("url_required", 400);
  }

  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return errorResponse("invalid_url_protocol", 400);
    }
  } catch {
    return errorResponse("invalid_url", 400);
  }

  const parsedLimit = typeof limit === "number" && Number.isInteger(limit) ? limit : 10;
  const brandName = typeof brand === "string" ? brand.trim() : undefined;

  try {
    const result = await scraperJobs.runUniversalScrape(url.trim(), {
      brand: brandName,
      limit: parsedLimit,
    });

    return NextResponse.json({
      ok: true,
      kind: result.kind,
      url: result.url,
      totalDiscovered: result.totalDiscovered,
      productsCount: result.products.length,
      products: result.products,
      errors: result.errors,
    });
  } catch (error: any) {
    if (error?.message === "IMPORT_IN_PROGRESS") {
      return errorResponse("import_in_progress", 409);
    }
    return errorResponse(error?.message ?? "scrape_failed", 500);
  }
}

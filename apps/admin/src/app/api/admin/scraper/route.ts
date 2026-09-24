import { NextResponse } from "next/server";
import type { ScrapeFilters } from "@kmodern/scraper";
import { db } from "@kmodern/db";
import { getAdminUser } from "@/lib/auth";
import { scraperJobs } from "@/lib/scraper-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

async function authorize() {
  const ctx = await getAdminUser();
  if (!ctx) return { response: errorResponse("unauthorized", 401) } as const;
  if (ctx.admin.role !== "OWNER") {
    return { response: errorResponse("forbidden", 403) } as const;
  }
  return { ctx } as const;
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

function requestMeta(request: Request) {
  return {
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  };
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
    const items = await scraperJobs.getCatalog({ publicView: true });
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(scraperJobs.get(), {
    headers: { "Cache-Control": "no-store" },
  });
}

function parseFilters(value: unknown): ScrapeFilters | null {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const filters: ScrapeFilters = {};
  for (const key of ["search", "manufacturer", "website", "category", "subCategory", "color"] as const) {
    const raw = input[key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (typeof raw !== "string" || raw.length > 200) return null;
    const text = raw.trim();
    if (!text || text === "all") continue;
    if (key === "search") filters.search = text;
    if (key === "manufacturer") filters.manufacturer = text;
    if (key === "website") filters.website = text;
    if (key === "category") filters.category = text;
    if (key === "subCategory") filters.subCategory = text;
    if (key === "color") filters.color = text;
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
  if (typeof cache !== "boolean") return errorResponse("invalid_cache", 400);
  if (typeof downloadImages !== "boolean") return errorResponse("invalid_download_images", 400);
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
    snapshot = scraperJobs.start({ source, limit, cache, downloadImages, filters });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SCRAPE_IN_PROGRESS") return errorResponse("scrape_in_progress", 409);
    if (message === "UNKNOWN_SOURCE" || message === "INVALID_LIMIT") {
      return errorResponse(message.toLowerCase(), 400);
    }
    return errorResponse("start_failed", 500);
  }

  try {
    const meta = requestMeta(request);
    await db().adminAuditLog.create({
      data: {
        adminUserId: auth.ctx.admin.id,
        action: "SCRAPER_STARTED",
        entityType: "SCRAPER",
        entityId: snapshot.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
        meta: { source, limit: limit ?? null, cache, downloadImages, filters: filters as never },
      },
    });
  } catch (error) {
    // The scrape has already started; an audit outage must not orphan the job.
    console.error("scraper audit write failed", error);
  }

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
    try {
      const meta = requestMeta(request);
      await db().adminAuditLog.create({
        data: {
          adminUserId: auth.ctx.admin.id,
          action: "SCRAPER_CANCEL_REQUESTED",
          entityType: "SCRAPER",
          entityId: snapshot.id,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
      });
    } catch (error) {
      console.error("scraper cancel audit write failed", error);
    }
  }
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}

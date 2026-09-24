import { NextResponse } from "next/server";
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
    const items = await scraperJobs.getCatalog();
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(scraperJobs.get(), {
    headers: { "Cache-Control": "no-store" },
  });
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
  if (typeof cache !== "boolean") return errorResponse("invalid_cache", 400);

  let limit: number | undefined;
  if (body.limit !== undefined && body.limit !== null && body.limit !== "") {
    if (typeof body.limit !== "number" && typeof body.limit !== "string") {
      return errorResponse("invalid_limit", 400);
    }
    limit = Number(body.limit);
  }

  let snapshot;
  try {
    snapshot = scraperJobs.start({ source, limit, cache });
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
        meta: { source, limit: limit ?? null, cache },
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

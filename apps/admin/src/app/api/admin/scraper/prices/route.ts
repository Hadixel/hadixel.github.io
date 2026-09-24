import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { db } from "@kmodern/db";
import { getAdminUser } from "@/lib/auth";
import { scraperJobs, scraperOutputDir } from "@/lib/scraper-jobs";
import type { PriceUnit } from "@kmodern/scraper/price-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".xlsx", ".xls", ".csv"]);

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

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

export async function POST(request: Request) {
  const ctx = await getAdminUser();
  if (!ctx) return errorResponse("unauthorized", 401);
  if (ctx.admin.role !== "OWNER") return errorResponse("forbidden", 403);
  if (!sameOrigin(request)) return errorResponse("invalid_origin", 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("invalid_form", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return errorResponse("file_required", 400);
  if (!ALLOWED_EXTENSIONS.has(extensionOf(file.name))) return errorResponse("price_file_required", 415);
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return errorResponse("invalid_file_size", 413);

  const mode = form.get("mode") === "apply" ? "apply" : "preview";
  const brandValue = form.get("brand");
  const brand = typeof brandValue === "string" && brandValue.trim() ? brandValue.trim() : undefined;
  if (brand && brand.length > 100) return errorResponse("invalid_brand", 400);
  const unitValue = form.get("unit");
  const unit = unitValue === "rial" ? "rial" : unitValue === "toman" ? "toman" : undefined;
  const revisionValue = form.get("catalogRevision");
  if (typeof revisionValue !== "string" || !/^[a-f0-9]{64}$/.test(revisionValue)) {
    return errorResponse("catalog_revision_required", 400);
  }

  const uploadDir = join(scraperOutputDir(), ".price-list-uploads");
  const filePath = join(uploadDir, `${randomUUID()}${extensionOf(file.name)}`);
  await mkdir(uploadDir, { recursive: true });
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

  try {
    const report = await scraperJobs.applyPriceList({
      filePath,
      sourceName: file.name,
      expectedRevision: revisionValue,
      brand,
      unit: unit as PriceUnit | undefined,
      dryRun: mode === "preview",
    });

    if (mode === "apply") {
      try {
        await db().adminAuditLog.create({
          data: {
            adminUserId: ctx.admin.id,
            action: "SCRAPER_PRICE_LIST_APPLIED",
            entityType: "SCRAPER",
            meta: {
              sourceFile: report.sourceFile,
              matchedCatalog: report.matchedCatalog,
              rawOnly: report.rawOnly,
              unmatched: report.unmatched,
              ambiguous: report.ambiguous,
              duplicate: report.duplicate,
              updates: report.updates.length,
            },
            ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
            userAgent: request.headers.get("user-agent") ?? undefined,
          },
        });
      } catch (auditError) {
        console.error("scraper price-list audit write failed", auditError);
      }
    }

    return NextResponse.json({ mode, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "اعمال لیست قیمت ناموفق بود";
    if (message === "IMPORT_IN_PROGRESS") return errorResponse("import_in_progress", 409);
    if (message === "CATALOG_CHANGED") return errorResponse("catalog_changed", 409);
    return errorResponse("price_list_failed", 422);
  } finally {
    await unlink(filePath).catch(() => undefined);
  }
}

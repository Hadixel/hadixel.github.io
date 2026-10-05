// A manufacturer's price list, applied to the review snapshot.
//
// The upload and the matching are file work in this process — the sheet is written under
// `packages/scraper/out`, parsed, and matched against the scraped catalogue — and neither moves
// behind the gateway, because the gateway is the one process that touches the database and this is
// not database work. What did move is the audit line: this route used to write
// `SCRAPER_PRICE_LIST_APPLIED` itself, through the panel's own data tier, inside a `try/catch` whose
// entire purpose was to keep a failed insert from reaching the operator. A price list applied with no
// record of who applied it is a catalogue nobody can account for, and the swallow is what made that
// quiet. The line is now the gateway's `POST /scraper/actions`, which writes it through `writeAudit`
// and fails loudly if it cannot.
//
// The origin check below is the one in `@/lib/origin`. This file used to define its own copy, and the
// three copies in the scraper routes were byte-identical — a check written out is a check maintained
// three times, and the copies can only agree by accident.

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/auth/lib/auth";
import { scraperJobs, scraperOutputDir } from "@/scraper/lib/scraper-jobs";
import { sameOrigin } from "@/lib/origin";
import { fromGateway } from "@/lib/gateway";
import type { PriceUnit } from "@kmodern/scraper-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".xlsx", ".xls", ".csv"]);

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return errorResponse(auth.status === 401 ? "unauthorized" : "password_change_required", auth.status);
  const ctx = auth.ctx;
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
  try {
    await mkdir(uploadDir, { recursive: true });
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  } catch {
    await unlink(filePath).catch(() => undefined);
    return errorResponse("file_write_failed", 500);
  }

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
      // The audit line, written by the gateway through the one helper every sensitive mutation uses.
      //
      // It is not inside a transaction because there is none to join: applying a price list rewrites
      // a file in this process, and a file cannot be rolled back from the database. That is exactly
      // why the failure is reported rather than swallowed. The old code logged and returned the
      // report anyway, so a price list that had been applied with nobody recorded as having applied
      // it looked identical to one that had been applied properly.
      const recorded = await fromGateway<{ recorded: true }>(
        (client) =>
          client.post("/scraper/actions", {
            action: "SCRAPER_PRICE_LIST_APPLIED",
            meta: {
              sourceFile: report.sourceFile,
              matchedCatalog: report.matchedCatalog,
              rawOnly: report.rawOnly,
              unmatched: report.unmatched,
              ambiguous: report.ambiguous,
              duplicate: report.duplicate,
              updates: report.updates.length,
            },
          }),
        "اعمال لیست قیمت ثبت شد.",
      );
      if (!recorded.ok) return errorResponse(recorded.error, 500);
    }

    return NextResponse.json({ mode, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("scraper price-list upload failed", error);
    const message = error instanceof Error ? error.message : "اعمال لیست قیمت ناموفق بود";
    if (message === "IMPORT_IN_PROGRESS") return errorResponse("import_in_progress", 409);
    if (message === "CATALOG_CHANGED") return errorResponse("catalog_changed", 409);
    return errorResponse("price_list_failed", 422);
  } finally {
    await unlink(filePath).catch(() => undefined);
  }
}

#!/usr/bin/env npx tsx
// Apply an XLSX consumer-price list to the current scraper catalog.
// Examples:
//   pnpm --filter @kmodern/scraper price-list -- --file ./D0249.xlsx
//   pnpm --filter @kmodern/scraper price-list -- --file ./prices.xlsx --brand Datees --dry-run

import { applyPriceList, type PriceUnit } from "./price-list";
import { readFlag } from "./args";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => readFlag(args, name);

const file = flag("file");
if (!file || file.startsWith("--")) {
  console.error("Usage: pnpm --filter @kmodern/scraper price-list -- --file <prices.xlsx> [--out-dir packages/scraper/out] [--brand Datees] [--unit toman|rial] [--dry-run]");
  process.exit(1);
}

const outDir = flag("out-dir") ?? "out";
const brand = flag("brand");
const unit = flag("unit") as PriceUnit | undefined;
if (unit && unit !== "toman" && unit !== "rial") {
  console.error("--unit must be toman or rial");
  process.exit(1);
}

try {
  const report = await applyPriceList({
    filePath: file,
    outDir,
    brand,
    unit,
    dryRun: args.includes("--dry-run"),
  });
  console.log(JSON.stringify({
    sourceFile: report.sourceFile,
    unit: report.unit,
    sourceUnits: report.sourceUnits,
    totalRows: report.totalRows,
    validRows: report.validRows,
    invalidRows: report.invalidRows,
    matchedCatalog: report.matchedCatalog,
    rawOnly: report.rawOnly,
    unmatched: report.unmatched,
    ambiguous: report.ambiguous,
    duplicate: report.duplicate,
    written: report.written,
    reportWritten: report.reportWritten,
    report: `${outDir}/price-list-report.json`,
  }, null, 2));
  if (args.includes("--strict") && (report.unmatched || report.ambiguous || report.duplicate || report.invalidRows)) process.exitCode = 2;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

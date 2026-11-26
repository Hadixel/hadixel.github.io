// Extract product models and prices from PDF price lists.
// Designed for Iranian manufacturer price circulars (لیست قیمت مصوب), which are
// typically multi-page tables containing model codes (e.g. DG-598, V-16, F20)
// and consumer prices in Rials or Tomans.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { normalizeFa } from "./refine";
import type { PriceListRow, PriceUnit } from "./price-list-types";

// Iranian appliance model pattern (ASCII + Persian prefixes):
// Matches: DG-598, DG 598, 598-DG, V-16, F20, B2052, G-142, Volira, etc.
const MODEL_TOKEN_RE = /\b([A-Z]{1,4}[-\s]?\d{2,4}[A-Z]?|\d{3,4}[-\s]?[A-Z]{1,4}|[A-Z]{4,8})\b/i;

// Price pattern: 7 to 10 digits with optional commas/dots/slashes/spaces
const PRICE_TOKEN_RE = /(?:^|\s)([\d,،/.]{7,12})(?:\s|$|ریال|تومان)/;

export interface ParsedPdfRows {
  rows: PriceListRow[];
  sourceUnits: Set<PriceUnit>;
  totalRows: number;
  invalidRows: number;
}

function canonModel(raw: string): string {
  return normalizeFa(raw)
    .toUpperCase()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Parses numeric string into Tomans based on detected/specified unit. */
export function cleanPdfPrice(raw: string, unitOverride?: PriceUnit): { priceToman: number; unit: PriceUnit } | null {
  const digitsOnly = normalizeFa(raw).replace(/[\s,،/._]/g, "");
  const num = Number.parseInt(digitsOnly, 10);
  if (Number.isNaN(num) || num <= 0) return null;

  let unit: PriceUnit = unitOverride ?? "toman";

  if (!unitOverride) {
    if (/ریال|irr/i.test(raw)) {
      unit = "rial";
    } else if (/تومان|irt/i.test(raw)) {
      unit = "toman";
    } else if (num >= 50_000_000) {
      // Heuristic: domestic appliances in Iran retail for 5M - 80M Tomans (50M - 800M Rials).
      // An unlabelled figure of 50M+ is almost certainly in Rials.
      unit = "rial";
    }
  }

  const priceToman = unit === "rial" ? Math.round(num / 10) : num;
  return { priceToman, unit };
}

/** Parses raw PDF text lines into structured PriceListRows. */
export function parsePdfTextToRows(
  text: string,
  fallbackUnit: PriceUnit = "toman",
  unitOverride?: PriceUnit,
): ParsedPdfRows {
  const lines = text.split(/\r?\n/);
  const rows: PriceListRow[] = [];
  const sourceUnits = new Set<PriceUnit>();
  let totalRows = 0;
  let invalidRows = 0;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const rawLine = lines[idx]?.trim();
    if (!rawLine || rawLine.length < 5) continue;

    const line = normalizeFa(rawLine);

    // Look for explicit model keywords first: "مدل DG-598" or "کد DG-598"
    let modelCandidate = "";
    const explicitModelMatch = line.match(/(?:مدل|کد)\s*[:\-]?\s*([A-Za-z0-9\-]+)/i);
    if (explicitModelMatch?.[1]) {
      modelCandidate = explicitModelMatch[1];
    } else {
      const match = line.match(MODEL_TOKEN_RE);
      if (match?.[1]) {
        modelCandidate = match[1];
      }
    }

    // Look for price on the line
    const priceMatch = line.match(PRICE_TOKEN_RE);
    const priceData = priceMatch?.[1] ? cleanPdfPrice(priceMatch[0], unitOverride) : null;

    if (modelCandidate && priceData) {
      totalRows += 1;
      const canonical = canonModel(modelCandidate);
      sourceUnits.add(priceData.unit);

      rows.push({
        model: canonical,
        sourceModel: modelCandidate,
        aliases: [canonical],
        priceToman: priceData.priceToman,
        sourceRow: idx + 1,
        sourceSheet: "PDF",
        sourceUnit: priceData.unit,
        unitConflict: false,
      });
    } else if (modelCandidate || priceMatch) {
      // Line had either a model or a price, but not both — count as invalid row
      invalidRows += 1;
    }
  }

  if (sourceUnits.size === 0) {
    sourceUnits.add(unitOverride ?? fallbackUnit);
  }

  return {
    rows,
    sourceUnits,
    totalRows,
    invalidRows,
  };
}

/** Reads a PDF file from disk and parses its text into PriceListRows. */
export async function readPdfRows(
  filePath: string,
  fallbackUnit: PriceUnit = "toman",
  unitOverride?: PriceUnit,
): Promise<ParsedPdfRows> {
  const buffer = await readFile(resolve(filePath));

  // Dynamically import pdf-parse's internal module to avoid its index.js test-pdf loading bug
  // @ts-expect-error pdf-parse internal lib has no dedicated types
  const pdfParseModule = await import("pdf-parse/lib/pdf-parse.js");
  const pdfParse = pdfParseModule.default ?? pdfParseModule;

  const data = await pdfParse(buffer);
  const text = data?.text ?? "";

  return parsePdfTextToRows(text, fallbackUnit, unitOverride);
}

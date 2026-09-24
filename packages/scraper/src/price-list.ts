// Apply a user-supplied XLSX price list to the current scraper catalog.
//
// The catalog fragment is the importable source of truth. Raw scrape records
// are indexed as a read-only fallback so a price row can be explained when a
// product was filtered or merged out of the current fragment. Only an
// unambiguous catalog match is ever written.

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import * as XLSXModule from "xlsx";
import { extractModelForSource, normalizeFa } from "./refine";
import type { RawSpec, ScrapeRecord } from "./types";

const XLSX = (XLSXModule as typeof XLSXModule & { default?: typeof XLSXModule }).default ?? XLSXModule;

export type PriceUnit = "toman" | "rial";
export type PriceListMatchStatus = "matched" | "raw-only" | "unmatched" | "ambiguous" | "duplicate" | "invalid";

export interface PriceListRow {
  /** Canonical model key used for matching (for example, `DG-587`). */
  model: string;
  /** Model text as it appeared in the workbook. */
  sourceModel: string;
  /** All model keys extracted from the source cell. */
  aliases: string[];
  priceToman: number;
  sourceRow: number;
  sourceSheet: string;
  sourceUnit: PriceUnit;
  unitConflict: boolean;
  invalidReason?: "model" | "price" | "unit" | "multiple-models";
}

export interface PriceListCandidate {
  kind: "catalog" | "raw";
  slug?: string;
  url?: string;
  sourceId: string;
  name: string;
  brand: string;
  matchedOn?: string;
}

export interface PriceListMatch {
  row: PriceListRow;
  status: PriceListMatchStatus;
  reason?: string;
  candidates?: PriceListCandidate[];
}

export interface PriceListUpdate {
  model: string;
  sourceModel: string;
  slug: string;
  previousPrice: number;
  priceToman: number;
  sourceRow: number;
  changed: boolean;
}

export interface PriceListReport {
  sourceFile: string;
  brand?: string;
  /** Currency of the values after conversion. */
  unit: "toman";
  /** Units detected in the source workbook. */
  sourceUnits: PriceUnit[];
  /** Number of non-empty data rows below the detected header. */
  totalRows: number;
  /** Rows with a usable model, price, and non-conflicting unit. */
  validRows: number;
  /** Rows retained in the report but not eligible for automatic matching. */
  invalidRows: number;
  matchedCatalog: number;
  rawOnly: number;
  unmatched: number;
  ambiguous: number;
  duplicate: number;
  rawAvailable: boolean;
  warnings: string[];
  updates: PriceListUpdate[];
  matches: PriceListMatch[];
  fetchedAt: number;
  /** True only when the catalog was changed. */
  written: boolean;
  /** True when price-list-report.json was persisted (including dry runs). */
  reportWritten: boolean;
}

export interface ApplyPriceListOptions {
  filePath: string;
  outDir: string;
  unit?: PriceUnit;
  brand?: string;
  dryRun?: boolean;
  /** Original upload name, used in reports/provenance instead of a temp name. */
  sourceName?: string;
  /** Optional optimistic hash of catalog.fragment.json. */
  expectedRevision?: string;
}

export interface PriceListProductTarget {
  slug: string;
  price: number | null;
  priceByColor?: Record<string, number>;
  priceCurrency?: string;
  priceFetchedAt?: number;
  priceInStock?: boolean;
  priceSourceId?: string;
  priceSourceUrl?: string;
}

type CatalogProduct = Record<string, unknown> & {
  slug: string;
  name: string;
  brand: string;
  _id: string;
  price: number;
  priceByColor?: Record<string, number>;
  priceSourceId?: string;
  priceSourceUrl?: string;
  priceCurrency?: string;
  priceFetchedAt?: number;
  priceInStock?: boolean;
  specs: RawSpec[];
  sourceId?: string;
};

type ProductCandidate = PriceListCandidate;

type ParsedRows = {
  rows: PriceListRow[];
  totalRows: number;
  invalidRows: number;
  sourceUnits: PriceUnit[];
};

type HeaderMatch = {
  modelIndex: number;
  priceIndex: number;
  rowIndex: number;
  sourceUnit?: PriceUnit;
};

type Resolution = {
  row: PriceListRow;
  status: PriceListMatchStatus;
  reason?: string;
  candidates: PriceListCandidate[];
  catalogCandidate?: PriceListCandidate;
};

const BIDI_CONTROLS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const CODE_PATTERN = /(?<![A-Z0-9])([A-Z]{1,10})[\s._-]*(\d{1,6})(?:[\s._-]*([A-Z]{1,10}))?(?![A-Z0-9])/g;
const REVERSED_CODE_PATTERN = /(?<![A-Z0-9])(\d{1,6})[\s._-]*([A-Z]{1,10})(?![A-Z0-9])/g;
const UNIT_CODES = new Set(["CM", "MM", "KG", "INCH", "IN", "FT"]);
const MODEL_SUFFIX_CODES = new Set([
  "U", "L", "E", "D", "R", "W", "P", "S", "M", "K", "X",
  "PRO", "PLUS", "MAX", "ULTRA", "LED", "TFT", "IOT", "SMART", "NEO",
]);
const MODEL_SPEC_PATTERN = /نام\s*مدل|مدل|کد\s*محصول|model/i;

function cleanText(value: unknown): string {
  return normalizeFa(String(value ?? "")).replace(BIDI_CONTROLS, "").trim();
}

function headerKey(value: unknown): string {
  return cleanText(value)
    .replace(/[\s_:：\-]+/g, "")
    .toLocaleLowerCase("en");
}

function explicitUnit(value: unknown): PriceUnit | undefined {
  const text = cleanText(value);
  if (/ریال|rial/i.test(text)) return "rial";
  if (/تومان|toman/i.test(text)) return "toman";
  return undefined;
}

function parsePrice(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  }
  if (typeof value !== "string") return null;
  const text = cleanText(value).replace(/[,\u066C\s]/g, "");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function strongestAliases(values: string[], compactAliases: Set<string> = new Set()): string[] {
  const unique = [...new Set(values.filter(Boolean))];
  // Only collapse a shorter alias when the longer one came from the compact
  // RTL representation. Two independently written model codes such as
  // DG-587 and DG-587-PRO must remain separate so the row is rejected.
  return unique.filter((value) => !unique.some((other) =>
    compactAliases.has(other) && other !== value && other.length > value.length && other.endsWith(value),
  ));
}

function unicodeWordKey(value: unknown): string | undefined {
  const text = cleanText(value).toUpperCase();
  if (!/[\u0600-\u06FF]/u.test(text) || /[A-Z]/u.test(text)) return undefined;
  const key = text.replace(/[^\p{L}\p{N}]+/gu, "");
  return key.length >= 2 && key.length <= 24 ? key : undefined;
}

interface AliasOptions {
  numeric?: boolean;
  word?: boolean;
  unicode?: boolean;
  /** Allow a numeric fallback for legacy IDs such as `بخارپز744`. */
  allowPersianNumeric?: boolean;
}

/**
 * Extract model aliases from a model cell, product name, or model spec.
 * Alphanumeric codes win over bare numbers so `DG-567` cannot collide with an
 * unrelated numeric or `S-567` product.
 */
function modelAliases(value: unknown, options: AliasOptions = {}): string[] {
  const text = cleanText(value).toUpperCase();
  if (!text) return [];
  const aliases: string[] = [];
  const compactAliases = new Set<string>();
  const letterFirstNumbers = new Set<string>();
  const hasPersianLetters = /[\u0600-\u06FF]/u.test(text);

  for (const match of text.matchAll(CODE_PATTERN)) {
    const prefix = match[1];
    const digits = match[2];
    const suffix = (match[3] ?? "").replace(/[^A-Z]/g, "");
    const key = `${prefix}${digits}${suffix}`;
    letterFirstNumbers.add(digits);
    if (!UNIT_CODES.has(key) && !UNIT_CODES.has(prefix)) aliases.push(key);
  }
  // A PDF cell can mix directions, for example `DG-587 / 598-DX`. Parse
  // digit-first tokens independently so the cell cannot look like DG-587
  // alone and then be applied to the wrong Product.
  for (const match of text.matchAll(REVERSED_CODE_PATTERN)) {
    const digits = match[1];
    const suffix = match[2].replace(/[^A-Z]/g, "");
    // `DG 551U` contains the text `551U`, but U is a suffix, not a second
    // reversed model. Keep unknown two-letter prefixes so `598-DX` remains
    // visible as a distinct code.
    if (letterFirstNumbers.has(digits) && (suffix.length === 1 || MODEL_SUFFIX_CODES.has(suffix))) continue;
    const key = `${suffix}${digits}`;
    if (!UNIT_CODES.has(key) && !UNIT_CODES.has(suffix)) aliases.push(key);
  }

  // Spaced Latin glyphs and RTL-reversed cells are common in the source PDF.
  // Only use the compact form when there is one numeric group; otherwise an
  // annotation such as "(5 شعله)" would be glued onto the model number.
  const compact = text.replace(/[^A-Z0-9]/g, "");
  const numericGroups = text.match(/\d+/g) ?? [];
  if (numericGroups.length <= 1 && compact.length <= 24) {
    const normal = compact.match(/^([A-Z]{1,10})(\d{1,6})([A-Z]{1,10})?$/);
    if (normal) {
      const key = `${normal[1]}${normal[2]}${normal[3] ?? ""}`;
      if (!UNIT_CODES.has(key) && !UNIT_CODES.has(normal[1])) {
        aliases.push(key);
        compactAliases.add(key);
      }
    }
    const reversed = compact.match(/^(\d{1,6})([A-Z]{1,10})$/);
    if (reversed) {
      const key = `${reversed[2]}${reversed[1]}`;
      if (!UNIT_CODES.has(key) && !UNIT_CODES.has(reversed[2])) {
        aliases.push(key);
        compactAliases.add(key);
      }
    }
  }

  if (aliases.length === 0 && options.word) {
    const trimmed = text.trim();
    if (/^[A-Z]{4,8}$/.test(trimmed)) aliases.push(trimmed);
  }
  if (aliases.length === 0 && options.unicode && hasPersianLetters) {
    const key = unicodeWordKey(text);
    if (key) aliases.push(key);
  }
  const hasMeasurement = /(?:cm|mm|inch|ft|kg|سانت|متر|کیلو|اینچ)/i.test(text);
  if (aliases.length === 0 && options.numeric && (!hasPersianLetters || options.allowPersianNumeric) && !hasMeasurement) {
    for (const match of text.matchAll(/(?<![A-Z0-9])(\d{2,6})(?![A-Z0-9])/g)) {
      aliases.push(match[1]);
    }
  }

  return strongestAliases(aliases, compactAliases);
}

function productModelAliases(product: { sourceId?: string; _id?: unknown; name?: unknown; specs?: RawSpec[] }): string[] {
  const sourceId = product.sourceId ?? "datees";
  const aliases = new Set<string>();
  for (const value of modelAliases(product._id, { numeric: true, word: true, allowPersianNumeric: true })) aliases.add(value);

  // The refiner already knows the source-specific word-model rules. Use its
  // result rather than treating every Latin word in a description as a model.
  const extracted = extractModelForSource(sourceId, String(product.name ?? ""), product.specs ?? []);
  if (extracted) {
    if (/^[A-Z]{4,8}$/.test(extracted)) aliases.add(extracted);
    else for (const value of modelAliases(extracted, { numeric: true, word: true, allowPersianNumeric: true })) aliases.add(value);
  }
  for (const value of modelAliases(product.name, { numeric: true, allowPersianNumeric: true })) aliases.add(value);
  for (const spec of product.specs ?? []) {
    if (!MODEL_SPEC_PATTERN.test(cleanText(spec.label))) continue;
    for (const value of modelAliases(spec.value, { numeric: true, word: true, unicode: true })) aliases.add(value);
  }
  return [...aliases];
}

function rawModelAliases(record: Pick<ScrapeRecord, "sourceId" | "name" | "specs">): string[] {
  return productModelAliases(record);
}

function findHeader(headers: unknown[], kind: "model" | "consumer"): number {
  return headers.findIndex((value) => {
    const key = headerKey(value);
    if (!key) return false;
    if (kind === "model") return key === "model" || key === "مدل" || key.includes("کدمدل") || key.includes("کدمحصول");
    if (key.includes("factory") || key.includes("تولید")) return false;
    return (key.includes("consumer") && key.includes("price")) ||
      key.includes("قیمتمصرف") || key === "قیمت";
  });
}

function findHeaderInRows(rows: unknown[][]): HeaderMatch | null {
  const limit = Math.min(rows.length, 25);
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!Array.isArray(row)) continue;
    const modelIndex = findHeader(row, "model");
    const priceIndex = findHeader(row, "consumer");
    if (modelIndex >= 0 && priceIndex >= 0) {
      return { modelIndex, priceIndex, rowIndex, sourceUnit: explicitUnit(row[priceIndex]) };
    }
  }
  return null;
}

function readRows(filePath: string, fallbackUnit: PriceUnit, unitOverride?: PriceUnit): ParsedRows {
  const workbook = XLSX.readFile(resolve(filePath), { cellDates: false });
  const rows: PriceListRow[] = [];
  const sourceUnits = new Set<PriceUnit>();
  let totalRows = 0;
  let invalidRows = 0;
  let foundHeader = false;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
    const header = findHeaderInRows(matrix);
    if (!header) continue;
    foundHeader = true;
    const headerUnit = unitOverride ?? header.sourceUnit ?? fallbackUnit;
    sourceUnits.add(headerUnit);

    for (let rowIndex = header.rowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
      const row = matrix[rowIndex];
      if (!Array.isArray(row) || row.every((value) => cleanText(value) === "")) continue;
      totalRows += 1;
      const sourceModel = cleanText(row[header.modelIndex]);
      const rawPrice = row[header.priceIndex];
      const aliases = modelAliases(sourceModel, { numeric: true, word: true, unicode: true });
      const rawPriceValue = parsePrice(rawPrice);
      const cellUnit = explicitUnit(rawPrice);
      const sourceUnit = unitOverride ?? cellUnit ?? headerUnit;
      const unitConflict = !unitOverride && Boolean(cellUnit && header.sourceUnit && cellUnit !== header.sourceUnit);
      sourceUnits.add(sourceUnit);
      const invalidReason = aliases.length === 0
        ? "model"
        : rawPriceValue === null
          ? "price"
          : unitConflict
            ? "unit"
            : aliases.length > 1
              ? "multiple-models"
              : undefined;
      if (invalidReason) invalidRows += 1;
      rows.push({
        model: aliases[0] ?? "",
        sourceModel,
        aliases,
        priceToman: rawPriceValue === null ? 0 : sourceUnit === "rial" ? Math.round(rawPriceValue / 10) : rawPriceValue,
        sourceRow: rowIndex + 1,
        sourceSheet: sheetName,
        sourceUnit,
        unitConflict,
        invalidReason,
      });
    }
  }

  if (!foundHeader) throw new Error("The price workbook needs a model column and a consumer-price column");
  return { rows, totalRows, invalidRows, sourceUnits: [...sourceUnits] };
}

function addCandidate(index: Map<string, ProductCandidate[]>, aliases: string[], candidate: ProductCandidate): void {
  for (const alias of aliases) {
    const list = index.get(alias) ?? [];
    const key = `${candidate.kind}:${candidate.slug ?? candidate.url ?? ""}`;
    if (!list.some((existing) => `${existing.kind}:${existing.slug ?? existing.url ?? ""}` === key)) {
      list.push({ ...candidate });
    }
    index.set(alias, list);
  }
}

function candidateKey(candidate: PriceListCandidate): string {
  return `${candidate.kind}:${candidate.slug ?? candidate.url ?? candidate.name}:${candidate.brand}`;
}

function uniqueCandidates(candidates: PriceListCandidate[]): PriceListCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidateKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function brandKey(value: unknown): string {
  const text = cleanText(value).toLocaleLowerCase("en");
  const known: Array<[string, string[]]> = [
    ["datees", ["datees", "datys", "داتیس"]],
    ["schuffle", ["schuffle", "schuffel", "شفل", "شوفل"]],
    ["zimon", ["zimon", "زیمون"]],
  ];
  for (const [canonical, aliases] of known) {
    if (aliases.some((alias) => text === alias || text.replace(/[\s_-]/g, "") === alias.replace(/[\s_-]/g, ""))) {
      return canonical;
    }
  }
  return text.replace(/[\s_-]+/g, "");
}

function brandMatches(candidate: PriceListCandidate, brand: string | undefined): boolean {
  if (!brand) return true;
  const wanted = brandKey(brand);
  const actual = brandKey(candidate.brand);
  return Boolean(wanted && actual && wanted === actual);
}

function lookupCandidates(index: Map<string, ProductCandidate[]>, row: PriceListRow, brand?: string): PriceListCandidate[] {
  const aliases = [...row.aliases].sort((a, b) => b.length - a.length);
  if (!aliases.length) return [];
  // A row with multiple codes is never silently reduced to the first one.
  if (aliases.length > 1) {
    return uniqueCandidates(aliases.flatMap((alias) => index.get(alias) ?? [])
      .filter((candidate) => brandMatches(candidate, brand))
      .map((candidate) => ({ ...candidate, matchedOn: candidate.matchedOn ?? alias })));
  }
  const alias = aliases[0];
  return uniqueCandidates((index.get(alias) ?? [])
    .filter((candidate) => brandMatches(candidate, brand))
    .map((candidate) => ({ ...candidate, matchedOn: alias })));
}

function equivalentCandidate(left: PriceListCandidate, right: PriceListCandidate): boolean {
  if (left.slug && right.slug) return left.slug === right.slug;
  if (left.url && right.url) return left.url === right.url;
  return brandKey(left.brand) === brandKey(right.brand) && cleanText(left.name) === cleanText(right.name);
}

function parseJsonArray(body: string, filePath: string): Record<string, unknown>[] {
  const parsed: unknown = JSON.parse(body);
  if (!Array.isArray(parsed)) throw new Error(`Expected an array in ${filePath}`);
  return parsed.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"));
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT");
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value, null, 2));
  await rename(temporaryPath, filePath);
}

function catalogCandidate(product: CatalogProduct): ProductCandidate {
  return {
    kind: "catalog",
    slug: product.slug,
    url: typeof product.sourcePageUrl === "string" ? product.sourcePageUrl : undefined,
    sourceId: product.sourceId ?? product.brand.toLocaleLowerCase("en"),
    name: product.name,
    brand: product.brand,
  };
}

function rawCandidate(record: ScrapeRecord): ProductCandidate {
  return {
    kind: "raw",
    url: record.url,
    sourceId: record.sourceId,
    name: record.name,
    brand: record.brand,
  };
}

/** Apply an XLSX consumer-price list to the latest catalog fragment. */
export async function applyPriceList(options: ApplyPriceListOptions): Promise<PriceListReport> {
  const filePath = resolve(options.filePath);
  const outDir = resolve(options.outDir);
  const sourceFile = basename(options.sourceName ?? filePath);
  const parsed = readRows(filePath, options.unit ?? "toman", options.unit);
  const catalogPath = join(outDir, "catalog.fragment.json");
  const rawPath = join(outDir, "raw-scrape.json");
  const catalogBody = await readFile(catalogPath, "utf8");
  const parsedCatalog: unknown = JSON.parse(catalogBody);
  if (!Array.isArray(parsedCatalog)) throw new Error(`Expected an array in ${catalogPath}`);
  const catalog = parsedCatalog.filter((value): value is CatalogProduct => Boolean(value && typeof value === "object")) as CatalogProduct[];

  let raw: ScrapeRecord[] = [];
  let rawBody: Buffer | undefined;
  let rawAvailable = true;
  const warnings: string[] = [];
  try {
    rawBody = await readFile(rawPath);
    raw = parseJsonArray(rawBody.toString("utf8"), rawPath) as unknown as ScrapeRecord[];
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    rawAvailable = false;
    warnings.push("raw-scrape.json was not found; raw-only matching was unavailable");
  }
  const revision = createHash("sha256")
    .update(catalogBody)
    .update(rawBody ?? Buffer.alloc(0))
    .digest("hex");
  if (options.expectedRevision && options.expectedRevision !== revision) throw new Error("CATALOG_CHANGED");

  const catalogIndex = new Map<string, ProductCandidate[]>();
  const rawIndex = new Map<string, ProductCandidate[]>();
  for (const product of catalog) addCandidate(catalogIndex, productModelAliases(product), catalogCandidate(product));
  for (const record of raw) addCandidate(rawIndex, rawModelAliases(record), rawCandidate(record));

  const resolutions: Resolution[] = parsed.rows.map((row) => {
    if (row.invalidReason) {
      return { row, status: "invalid", reason: row.invalidReason, candidates: [] };
    }
    const catalogCandidates = lookupCandidates(catalogIndex, row, options.brand);
    const rawCandidates = rawAvailable ? lookupCandidates(rawIndex, row, options.brand) : [];
    if (catalogCandidates.length > 1) {
      return { row, status: "ambiguous", reason: "multiple catalog candidates", candidates: catalogCandidates };
    }
    if (catalogCandidates.length === 1) {
      const candidate = catalogCandidates[0];
      const conflictingRaw = rawCandidates.filter((rawProduct) => !equivalentCandidate(candidate, rawProduct));
      if (conflictingRaw.length) {
        return {
          row,
          status: "ambiguous",
          reason: "catalog/raw model conflict",
          candidates: uniqueCandidates([candidate, ...conflictingRaw]),
        };
      }
      return { row, status: "matched", candidates: [candidate], catalogCandidate: candidate };
    }
    if (rawCandidates.length > 1) {
      return { row, status: "ambiguous", reason: "multiple raw candidates", candidates: rawCandidates };
    }
    if (rawCandidates.length === 1) {
      return { row, status: "raw-only", candidates: rawCandidates };
    }
    return { row, status: "unmatched", candidates: [] };
  });

  // A repeated model row is a duplicate even when both prices agree. Also
  // reject different model aliases that resolve to the same catalog slug.
  const duplicateGroups: Resolution[][] = [];
  const duplicateMembers = new Set<Resolution>();
  const addDuplicateGroup = (group: Resolution[]): void => {
    if (group.length <= 1) return;
    const fresh = group.filter((resolution) => !duplicateMembers.has(resolution));
    if (!fresh.length) return;
    duplicateGroups.push(group);
    for (const resolution of group) duplicateMembers.add(resolution);
  };
  const byModel = new Map<string, Resolution[]>();
  for (const resolution of resolutions) {
    if (resolution.status === "invalid") continue;
    byModel.set(resolution.row.model, [...(byModel.get(resolution.row.model) ?? []), resolution]);
  }
  for (const group of byModel.values()) addDuplicateGroup(group);
  const bySlug = new Map<string, Resolution[]>();
  for (const resolution of resolutions) {
    if (!resolution.catalogCandidate?.slug || resolution.status !== "matched") continue;
    bySlug.set(resolution.catalogCandidate.slug, [...(bySlug.get(resolution.catalogCandidate.slug) ?? []), resolution]);
  }
  for (const group of bySlug.values()) addDuplicateGroup(group);
  for (const group of duplicateGroups) {
    for (const resolution of group) {
      resolution.status = "duplicate";
      resolution.reason = "duplicate model row or duplicate catalog target";
      resolution.catalogCandidate = undefined;
    }
  }

  const updates: PriceListUpdate[] = [];
  let matchedCatalog = 0;
  let rawOnly = 0;
  let unmatched = 0;
  let ambiguous = 0;
  const duplicate = duplicateGroups.length;
  for (const resolution of resolutions) {
    if (resolution.status === "matched" && resolution.catalogCandidate?.slug) {
      const current = catalog.find((product) => product.slug === resolution.catalogCandidate!.slug);
      if (!current) continue;
      const previousPrice = Number(current.price) || 0;
      const sourceId = `xlsx:${sourceFile}`;
      const changed = previousPrice !== resolution.row.priceToman ||
        current.priceSourceId !== sourceId ||
        current.priceCurrency !== "TOMAN" ||
        Boolean(current.priceByColor && Object.keys(current.priceByColor).length) ||
        current.priceInStock !== undefined;
      const update: PriceListUpdate = {
        model: resolution.row.model,
        sourceModel: resolution.row.sourceModel,
        slug: current.slug,
        previousPrice,
        priceToman: resolution.row.priceToman,
        sourceRow: resolution.row.sourceRow,
        changed,
      };
      updates.push(update);
      matchedCatalog += 1;
    } else if (resolution.status === "raw-only") rawOnly += 1;
    else if (resolution.status === "unmatched") unmatched += 1;
    else if (resolution.status === "ambiguous") ambiguous += 1;
  }

  const fetchedAt = Date.now();
  const report: PriceListReport = {
    sourceFile,
    brand: options.brand,
    unit: "toman",
    sourceUnits: parsed.sourceUnits,
    totalRows: parsed.totalRows,
    validRows: parsed.rows.length - parsed.invalidRows,
    invalidRows: parsed.invalidRows,
    matchedCatalog,
    rawOnly,
    unmatched,
    ambiguous,
    duplicate,
    rawAvailable,
    warnings,
    updates,
    matches: resolutions.map((resolution) => ({
      row: resolution.row,
      status: resolution.status,
      reason: resolution.reason,
      candidates: resolution.candidates.length ? resolution.candidates : undefined,
    })),
    fetchedAt,
    written: false,
    reportWritten: false,
  };
  if (options.dryRun) {
    report.reportWritten = true;
    await writeJsonAtomic(join(outDir, "price-list-report.json"), report);
    return report;
  }

  const updatedCatalog = applyPriceListReportToProducts(catalog, report);
  if (updatedCatalog.some((product, index) => product !== catalog[index])) {
    await writeJsonAtomic(catalogPath, updatedCatalog);
    report.written = true;
  }
  report.reportWritten = true;
  await writeJsonAtomic(join(outDir, "price-list-report.json"), report);
  return report;
}

/** Apply a completed file-price report to an in-memory refined product list. */
export function applyPriceListReportToProducts<T extends PriceListProductTarget>(
  products: T[],
  report: PriceListReport,
): T[] {
  const updates = new Map(report.updates.filter((update) => update.changed).map((update) => [update.slug, update]));
  return products.map((product) => {
    const update = updates.get(product.slug);
    if (!update) return product;
    const next = {
      ...product,
      price: update.priceToman,
      priceCurrency: "TOMAN" as const,
      priceFetchedAt: report.fetchedAt,
      priceSourceId: `xlsx:${report.sourceFile}`,
    } as T & Record<string, unknown>;
    delete next.priceByColor;
    delete next.priceSourceUrl;
    delete next.priceInStock;
    return next as T;
  });
}

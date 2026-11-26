// Contracts and types for price lists, extracted to prevent circular dependencies.

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
  unit: "toman";
  sourceUnits: PriceUnit[];
  totalRows: number;
  validRows: number;
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
  written: boolean;
  reportWritten: boolean;
}

export interface ApplyPriceListOptions {
  filePath: string;
  outDir: string;
  unit?: PriceUnit;
  brand?: string;
  dryRun?: boolean;
  sourceName?: string;
  expectedRevision?: string;
}

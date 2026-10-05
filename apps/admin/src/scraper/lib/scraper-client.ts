import type {
  PriceListReport,
  ScrapeFilters,
  ScraperCatalogEdit,
  ScraperCatalogItem,
  ScraperJobSnapshot,
  ScraperLiveView,
} from "@/scraper/lib/scraper-types";

/**
 * The panel's transport: one function per endpoint of the panel's own `/api/admin/scraper` routes.
 * The panel is a client of those routes and of nothing else — it never reaches for the gateway
 * directly, and it never learns a URL.
 *
 * Every function rejects on failure. There is no failure-object convention on this transport: the
 * route handlers answer a failed call with a non-2xx status and an `{ error }` body, and the
 * message in that body is what the operator is shown, so it is thrown rather than returned.
 */

const BASE_PATH = "/api/admin/scraper";

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  const raw = await response.text();
  let data: (T & { error?: string }) | null = null;
  if (raw.trim()) {
    try {
      data = JSON.parse(raw) as T & { error?: string };
    } catch {
      throw new Error(response.ok ? `پاسخ JSON از ${path} معتبر نیست.` : `خطای ${response.status} از ${path}.`);
    }
  }
  if (!response.ok) throw new Error(data?.error ?? `خطای ${response.status} از ${path}.`);
  if (!data) throw new Error(`پاسخ خالی از ${path} دریافت شد.`);
  return data;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "درخواست ناموفق بود";
}

export interface ScraperCatalogResponse {
  items: ScraperCatalogItem[];
  revision: string | null;
}

export interface ScraperImportResult {
  products: number;
  variants: number;
  images: number;
  imageErrors: number;
  status: "DRAFT" | "PUBLISHED";
}

export interface PriceListResponse {
  mode: "preview" | "apply";
  report: PriceListReport;
}

export interface StartScraperJobRequest {
  source: string;
  limit: number | null;
  cache: boolean;
  downloadImages: boolean;
  priceLookup: boolean;
  filters: ScrapeFilters;
}

export interface PriceListRequest {
  file: File;
  mode: "preview" | "apply";
  catalogRevision: string;
  brand: string;
  unit: "auto" | "toman" | "rial";
}

export interface ImportScraperRequest {
  slugs: string[];
  edits: Record<string, ScraperCatalogEdit>;
  catalogRevision: string;
  publish: boolean;
}

/** `GET /api/admin/scraper` — the snapshot the 1.5s poll reads. */
export function fetchScraperJob(): Promise<ScraperJobSnapshot> {
  return apiRequest<ScraperJobSnapshot>(BASE_PATH);
}

/** `GET /api/admin/scraper?view=live` — rows read so far by the run in flight. */
export function fetchScraperLiveView(): Promise<ScraperLiveView> {
  return apiRequest<ScraperLiveView>(`${BASE_PATH}?view=live`);
}

/** `GET /api/admin/scraper?view=catalog` — the finished output, for review. */
export function fetchScraperCatalog(): Promise<ScraperCatalogResponse> {
  return apiRequest<ScraperCatalogResponse>(`${BASE_PATH}?view=catalog`);
}

/** `POST /api/admin/scraper` — start a run. */
export function startScraperJob(request: StartScraperJobRequest): Promise<ScraperJobSnapshot> {
  return apiRequest<ScraperJobSnapshot>(BASE_PATH, { method: "POST", body: JSON.stringify(request) });
}

/** `DELETE /api/admin/scraper` — ask the run to stop. */
export function cancelScraperJob(): Promise<ScraperJobSnapshot> {
  return apiRequest<ScraperJobSnapshot>(BASE_PATH, { method: "DELETE" });
}

/** `POST /api/admin/scraper/prices` — multipart; preview a price list, or apply it to the output. */
export function submitScraperPriceList(request: PriceListRequest): Promise<PriceListResponse> {
  const form = new FormData();
  form.set("file", request.file);
  form.set("mode", request.mode);
  form.set("catalogRevision", request.catalogRevision);
  if (request.brand.trim()) form.set("brand", request.brand.trim());
  if (request.unit !== "auto") form.set("unit", request.unit);
  return apiRequest<PriceListResponse>(`${BASE_PATH}/prices`, { method: "POST", body: form });
}

/** `POST /api/admin/scraper/import` — write the selected products into the store. */
export function importScraperCatalog(request: ImportScraperRequest): Promise<ScraperImportResult> {
  return apiRequest<ScraperImportResult>(`${BASE_PATH}/import`, { method: "POST", body: JSON.stringify(request) });
}

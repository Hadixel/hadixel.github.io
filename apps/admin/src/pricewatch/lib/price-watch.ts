// Price watch, as a thin module over the gateway.
//
// The shapes below are the gateway's answers, restated — and the reason they are restated rather
// than imported is that the gateway is another process: `apps/admin` has no TypeScript path into
// `apps/api`, and the panel's build must not depend on the gateway's source. What this file
// therefore has to be is *one* restatement, declared once and imported by both the page that reads
// and the form that renders. The alternative — the shape declared on the page and again in the
// component — is what `settings/lib/settings.ts` says it used to do, where the two could disagree
// about what a field is and the form would send something the gateway refuses.
//
// The request builders are here for the same reason and for one more: a form cannot express "leave
// that one alone". A checkbox that is unticked and a checkbox that was never on the form both post
// the same absence, so what the operator actually chose has to be read off the form and sent as an
// explicit boolean. The gateway is what decides whether it is a legal one.
//
// Not a `"use server"` module, for the reason `settings.ts` gives: the session check goes through
// `cookies()`, which throws outside a request scope, so it lives in the actions adapter.

import { fromGateway } from "@/lib/gateway";
import { field, intField } from "@/lib/actions/form-helpers";
import { failed, type ActionResult } from "@/lib/actions/result";

/** The two schedules, as `GET /price-watch` answers them. */
export type PriceWatchMode = "INTERVAL" | "DAILY";

/** The three states a recorded difference can be in. */
export type PriceChangeStatus = "PENDING" | "APPLIED" | "IGNORED";

export interface PriceWatchConfig {
  enabled: boolean;
  mode: PriceWatchMode;
  intervalMinutes: number;
  dailyAt: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  /** Named by the gateway so the panel can show it rather than assume it. */
  timezone: string;
}

export interface PriceWatchRun {
  id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  trigger: "SCHEDULE" | "MANUAL";
  quotes: number;
  matched: number;
  changes: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface PriceWatchOverview {
  config: PriceWatchConfig;
  runs: PriceWatchRun[];
  pendingChanges: number;
}

export interface PriceChangeRow {
  id: string;
  runId: string;
  variantId: string;
  productId: string;
  sku: string;
  productName: string;
  colorName: string;
  fromPrice: number;
  toPrice: number;
  sourceUrl: string;
  status: PriceChangeStatus;
  detectedAt: string;
  appliedAt: string | null;
}

export interface PriceChangePage {
  rows: PriceChangeRow[];
  total: number;
  page: number;
  size: number;
}

/** What `POST /price-watch/config` accepts. Mirrors the gateway's DTO rather than importing it. */
interface SaveConfigBody {
  enabled: boolean;
  mode: PriceWatchMode;
  intervalMinutes: number;
  dailyAt?: string;
}

/** What the apply and ignore routes accept. An empty list is "all pending", not "none". */
interface ApplyBody {
  ids: string[];
}

/**
 * Send the configuration the operator chose.
 *
 * `enabled` is sent explicitly rather than omitted when off, because the gateway's field is a
 * required boolean and a form's unticked checkbox posts nothing at all. `dailyAt` is omitted
 * entirely in INTERVAL mode rather than sent as `""`: a blank string is not a time, and the
 * gateway's `@Matches` would — correctly — refuse it.
 */
export async function savePriceWatchRequest(formData: FormData): Promise<ActionResult> {
  const mode = field(formData, "mode") === "DAILY" ? "DAILY" : "INTERVAL";
  // Hours in the field, minutes on the wire. The form says "هر ۶ ساعت" because that is what an
  // operator reads; the column and the arithmetic are in minutes, and the conversion belongs to the
  // one place that knows about both.
  const hours = intField(formData, "intervalHours", 6);
  const dailyAt = field(formData, "dailyAt");

  return fromGateway(
    (client) =>
      client.post("/price-watch/config", {
        enabled: formData.get("enabled") === "on" || formData.get("enabled") === "true",
        mode,
        intervalMinutes: Math.round(hours * 60),
        ...(mode === "DAILY" && dailyAt ? { dailyAt } : {}),
      } satisfies SaveConfigBody),
    "زمان‌بندی نظارت قیمت ذخیره شد",
  );
}

/** Check the source now, through the same code path the schedule uses. */
export async function runPriceWatchNowRequest(): Promise<ActionResult> {
  return fromGateway((client) => client.post("/price-watch/run", {}), "بررسی قیمت‌ها آغاز شد");
}

/** Apply the named changes, or every pending one when the form names none. */
export async function applyPriceChangesRequest(ids: string[]): Promise<ActionResult> {
  return fromGateway(
    (client) => client.post("/price-watch/changes/apply", { ids } satisfies ApplyBody),
    ids.length ? "قیمت‌های انتخاب‌شده اعمال شد" : "همهٔ قیمت‌های در انتظار اعمال شد",
  );
}

/** Set the named changes aside, or every pending one when the form names none. */
export async function ignorePriceChangesRequest(ids: string[]): Promise<ActionResult> {
  return fromGateway(
    (client) => client.post("/price-watch/changes/ignore", { ids } satisfies ApplyBody),
    ids.length ? "تغییرات انتخاب‌شده رد شد" : "همهٔ قیمت‌های در انتظار رد شد",
  );
}

/** Read the ids a form submitted as checked boxes, in the order they appear. */
export function selectedChangeIds(formData: FormData): string[] {
  return formData
    .getAll("ids")
    .map((value) => String(value).trim())
    .filter(Boolean);
}

/** The queue's filter, from a search param, narrowed to a state the gateway accepts. */
export function changeStatusParam(
  value: string | undefined,
): PriceChangeStatus | undefined {
  return value === "PENDING" || value === "APPLIED" || value === "IGNORED" ? value : undefined;
}

/** `field`/`intField` re-exported so the actions import one module rather than two. */
export { field, intField, failed };

import { formatJalaliDateTime } from "@kmodern/contracts";
import { SCRAPE_FILTER_LABELS } from "@/scraper/lib/scraper-labels";
import type { ScrapeFilters } from "@/scraper/lib/scraper-types";

/**
 * Formatting and sanitising. Nothing here touches state or the network — every function is a pure
 * function of its arguments, which is what makes them safe to lift out of the panel wholesale.
 */

/**
 * A manufacturer URL is whatever the scraped data said it was, so it goes into `href` and `src`
 * untouched in the file it came from. Only http(s) leaves here; `javascript:` and `data:` do not.
 */
export function safeExternalUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Product images are the panel's own routes more often than the manufacturer's site: a stored
 * download lives under `/api/admin/scraper`, an unsaved one under `/products`. Those two are ours
 * and are passed through verbatim; anything else has to survive `safeExternalUrl`.
 */
export function safePreviewUrl(value: string | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/api/admin/scraper?image=") || value.startsWith("/products/")) return value;
  return safeExternalUrl(value);
}

export function formatTime(value: string | null): string {
  if (!value) return "—";
  try {
    return formatJalaliDateTime(new Date(value));
  } catch {
    return "—";
  }
}

/** The run's own filters, as one line of prose for the status card. */
export function formatScrapeFilters(filters: ScrapeFilters | null | undefined): string {
  if (!filters) return "";
  return Object.entries(filters)
    .filter(([, value]) => value && value !== "all" && (!Array.isArray(value) || value.length > 0))
    .map(([key, value]) => `${SCRAPE_FILTER_LABELS[key] ?? key}: ${Array.isArray(value) ? value.join("، ") : value}`)
    .join(" · ");
}

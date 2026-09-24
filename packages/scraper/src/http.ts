// Polite HTTP layer: per-host rate limiting, retries with backoff, disk cache.
// Manufacturer sites are small; courtesy beats speed here.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface FetchOptions {
  minIntervalMs?: number; // per-host delay between requests
  timeoutMs?: number;
  retries?: number;
  cacheDir?: string; // unset = no caching
  userAgent?: string;
  signal?: AbortSignal; // cooperative cancellation for interactive clients
  maxBytes?: number; // binary download guard
  onError?: (error: Error, url: string) => void; // final request failure hook
}

const DEFAULTS = {
  minIntervalMs: 1500,
  timeoutMs: 20_000,
  retries: 3,
  userAgent:
    "Mozilla/5.0 (compatible; kmodern-scraper/0.1; catalog ingestion)",
};

const lastHit = new Map<string, number>(); // host -> epoch ms

function abortError(): Error {
  const error = new Error("Request cancelled");
  error.name = "AbortError";
  return error;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function throttle(
  host: string,
  minIntervalMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw abortError();

  const prev = lastHit.get(host);
  if (prev !== undefined) {
    const wait = prev + minIntervalMs - Date.now();
    if (wait > 0) await delay(wait, signal);
  }
  lastHit.set(host, Date.now());
}

function cacheKey(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32) + ".html";
}

export async function fetchHtml(
  url: string,
  opts: FetchOptions = {},
): Promise<string> {
  const o = { ...DEFAULTS, ...opts };
  if (o.signal?.aborted) throw abortError();
  const host = new URL(url).host;

  const dir = o.cacheDir && join(o.cacheDir, host);
  const file = dir && join(dir, cacheKey(url));
  if (file && existsSync(/* turbopackIgnore: true */ file)) {
    return readFileSync(/* turbopackIgnore: true */ file, "utf8");
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < o.retries!; attempt++) {
    await throttle(host, o.minIntervalMs!, o.signal);
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    o.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => ctrl.abort(), o.timeoutMs!);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": o.userAgent!,
          "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.5",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const html = await res.text();
      if (dir) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file!, html);
      }
      return html;
    } catch (e) {
      if (o.signal?.aborted) throw abortError();
      lastErr = e;
      // exponential-ish backoff; 4xx other than 429 won't fix themselves
      const msg = String(e);
      if (/HTTP 4\d\d/.test(msg) && !msg.includes("429")) break;
      if (attempt < o.retries! - 1) await delay(1000 * 2 ** attempt, o.signal);
    } finally {
      clearTimeout(timer);
      o.signal?.removeEventListener("abort", onAbort);
    }
  }
  const finalError = lastErr instanceof Error
    ? lastErr
    : new Error(lastErr ? String(lastErr) : "Request failed");
  o.onError?.(finalError, url);
  throw finalError;
}

/** Fetch a binary asset with the same retry, timeout, and politeness policy as HTML. */
export async function fetchBuffer(
  url: string,
  opts: FetchOptions = {},
): Promise<Uint8Array> {
  const o = { ...DEFAULTS, ...opts };
  if (o.signal?.aborted) throw abortError();
  const host = new URL(url).host;
  let lastErr: unknown;

  for (let attempt = 0; attempt < o.retries!; attempt++) {
    await throttle(host, o.minIntervalMs!, o.signal);
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    o.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => ctrl.abort(), o.timeoutMs!);
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": o.userAgent!,
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        signal: ctrl.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      const declaredSize = Number(response.headers.get("content-length") ?? 0);
      if (o.maxBytes && declaredSize > o.maxBytes) {
        throw new Error(`Image exceeds ${o.maxBytes} bytes: ${url}`);
      }
      const body = new Uint8Array(await response.arrayBuffer());
      if (o.maxBytes && body.byteLength > o.maxBytes) {
        throw new Error(`Image exceeds ${o.maxBytes} bytes: ${url}`);
      }
      return body;
    } catch (error) {
      if (o.signal?.aborted) throw abortError();
      lastErr = error;
      const message = String(error);
      if (/HTTP 4\d\d/.test(message) && !message.includes("429")) break;
      if (attempt < o.retries! - 1) await delay(1000 * 2 ** attempt, o.signal);
    } finally {
      clearTimeout(timer);
      o.signal?.removeEventListener("abort", onAbort);
    }
  }

  const finalError = lastErr instanceof Error
    ? lastErr
    : new Error(lastErr ? String(lastErr) : "Binary request failed");
  o.onError?.(finalError, url);
  throw finalError;
}
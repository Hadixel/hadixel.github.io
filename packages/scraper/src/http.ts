// Polite HTTP layer: per-host rate limiting, retries with backoff, disk cache.
// Manufacturer sites are small; courtesy beats speed here.

import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as ipaddr from "ipaddr.js";
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

export interface FetchOptions {
  minIntervalMs?: number; // per-host delay between requests
  timeoutMs?: number;
  retries?: number;
  cacheDir?: string; // unset = no caching
  cacheTtlMs?: number; // cached HTML/API freshness window; 0 disables reads
  userAgent?: string;
  signal?: AbortSignal; // cooperative cancellation for interactive clients
  maxBytes?: number; // binary download guard
  allowedContentTypes?: string[]; // e.g. image/ for binary assets
  onError?: (error: Error, url: string) => void; // final request failure hook
}

const DEFAULTS = {
  minIntervalMs: 1500,
  timeoutMs: 20_000,
  retries: 3,
  cacheTtlMs: 24 * 60 * 60 * 1000,
  userAgent:
    "Mozilla/5.0 (compatible; kmodern-scraper/0.1; catalog ingestion)",
};

function isPrivateIp(address: string): boolean {
  try {
    const parsed = ipaddr.parse(address);
    if (parsed.kind() === "ipv6") {
      const ipv6 = parsed as ipaddr.IPv6;
      if (ipv6.isIPv4MappedAddress()) return isPrivateIp(ipv6.toIPv4Address().toString());
    }
    // `range()` identifies loopback, private, link-local, multicast,
    // documentation, benchmarking and other non-unicast ranges for both
    // families. Only globally routable unicast addresses are allowed.
    return parsed.range() !== "unicast";
  } catch {
    return true;
  }
}

/** Reject URLs that could make the scraper reach local/internal services. */
export async function assertSafeRemoteUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid remote URL");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("Remote URL must be an unauthenticated HTTP(S) URL");
  }
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("Remote URL port is not allowed");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Local remote host is not allowed");
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error("Private or unresolvable remote host is not allowed");
  }
  return url;
}

async function fetchWithRedirects(url: string, init: RequestInit, maxRedirects = 4): Promise<Response> {
  let current = url;
  for (let redirect = 0; ; redirect++) {
    const safeUrl = await assertSafeRemoteUrl(current);
    const response = await fetch(safeUrl, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    if (!location || redirect >= maxRedirects) throw new Error("Too many redirects");
    current = new URL(location, safeUrl).toString();
  }
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<Buffer> {
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes`);
  if (!response.body) {
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes`);
    return body;
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes`);
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

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

function cacheIsFresh(file: string, ttlMs: number): boolean {
  if (ttlMs <= 0 || !existsSync(/* turbopackIgnore: true */ file)) return false;
  try {
    return Date.now() - statSync(/* turbopackIgnore: true */ file).mtimeMs < ttlMs;
  } catch {
    return false;
  }
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
  if (file && cacheIsFresh(file, o.cacheTtlMs!)) {
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
      const res = await fetchWithRedirects(url, {
        headers: {
          "User-Agent": o.userAgent!,
          "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.5",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const html = (await readResponseBytes(res, o.maxBytes ?? 8 * 1024 * 1024)).toString("utf8");
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
      const response = await fetchWithRedirects(url, {
        headers: {
          "User-Agent": o.userAgent!,
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        signal: ctrl.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
      if (o.allowedContentTypes?.length && (!contentType || !o.allowedContentTypes.some((type) => contentType.startsWith(type)))) {
        throw new Error(`Unexpected content type for ${url}`);
      }
      return new Uint8Array(await readResponseBytes(response, o.maxBytes ?? 10 * 1024 * 1024));
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
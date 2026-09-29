// Polite HTTP layer: per-host rate limiting, retries with backoff, disk cache.
// Manufacturer sites are small; courtesy beats speed here.

import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { LookupAddress } from "node:dns";
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

/**
 * ipaddr.js is published as CommonJS. Bundlers (Next.js) and Vitest surface its
 * exports directly, but plain Node ESM — the scraper CLI and TUI — only exposes
 * the `default` interop binding. Without this, `ipaddr.parse` is `undefined`,
 * every address throws, and the SSRF guard below rejects every remote host.
 */
const ipaddrRuntime: typeof ipaddr =
  (ipaddr as { default?: typeof ipaddr }).default ?? ipaddr;

function isPrivateIp(address: string): boolean {
  try {
    const parsed = ipaddrRuntime.parse(address);
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

/**
 * Resolver failures are transient by nature (`EAI_AGAIN` is a temporary
 * failure, not NXDOMAIN), so the retry loop treats them as worth retrying with
 * a longer, resolver-friendly pause. The SSRF check re-runs on every attempt.
 */
export class DnsLookupError extends Error {
  constructor(hostname: string, cause: unknown) {
    super(`DNS lookup failed for ${hostname}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "DnsLookupError";
  }
}

const dnsCache = new Map<string, { addresses: LookupAddress[]; expiresAt: number }>();
const DNS_CACHE_TTL_MS = 60_000;
const DNS_MAX_CACHE_ENTRIES = 64;

async function resolveHost(hostname: string): Promise<LookupAddress[]> {
  const cached = dnsCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.addresses;

  let addresses: LookupAddress[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    // A transient failure must not be cached; the next attempt should retry.
    throw new DnsLookupError(hostname, error);
  }
  if (addresses.length) {
    if (dnsCache.size >= DNS_MAX_CACHE_ENTRIES) {
      const oldest = dnsCache.keys().next();
      if (!oldest.done) dnsCache.delete(oldest.value);
    }
    dnsCache.set(hostname, { addresses, expiresAt: Date.now() + DNS_CACHE_TTL_MS });
  }
  return addresses;
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
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolveHost(hostname);
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

/**
 * A resolver that answers `EAI_AGAIN` needs seconds, not milliseconds, to
 * recover, so DNS failures back off far more patiently than a refused socket.
 */
function backoffFor(error: unknown, attempt: number): number {
  return (error instanceof DnsLookupError ? 3_000 : 500) * 2 ** attempt;
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

function startsWithAscii(bytes: Uint8Array, signature: string, offset = 0): boolean {
  for (let i = 0; i < signature.length; i++) {
    if (bytes[offset + i] !== signature.charCodeAt(i)) return false;
  }
  return true;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = offset; i < offset + length; i++) out += String.fromCharCode(bytes[i] ?? 0);
  return out;
}

const CONTENT_TYPE_SIGNATURES: readonly { contentType: string; test: (bytes: Uint8Array) => boolean }[] = [
  { contentType: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    contentType: "image/png",
    test: (b) => b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  { contentType: "image/gif", test: (b) => startsWithAscii(b, "GIF87a") || startsWithAscii(b, "GIF89a") },
  { contentType: "image/webp", test: (b) => startsWithAscii(b, "RIFF") && startsWithAscii(b, "WEBP", 8) },
  { contentType: "image/avif", test: (b) => ascii(b, 4, 4) === "ftyp" && ascii(b, 8, 3) === "avi" },
  { contentType: "image/bmp", test: (b) => startsWithAscii(b, "BM") },
  { contentType: "image/x-icon", test: (b) => b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00 },
  { contentType: "image/tiff", test: (b) => startsWithAscii(b, "II*") || startsWithAscii(b, "MM") },
  { contentType: "application/pdf", test: (b) => startsWithAscii(b, "%PDF-") },
  { contentType: "application/zip", test: (b) => startsWithAscii(b, "PK") },
  { contentType: "application/gzip", test: (b) => b[0] === 0x1f && b[1] === 0x8b },
];

/**
 * Identify a payload from its magic bytes.
 *
 * Some manufacturer hosts (datees.ir among them) serve images with no
 * `Content-Type` header at all, so a header-only check rejects valid files.
 * Sniffing is the fallback; the declared header still wins when it is present
 * and allowed. Only non-scriptable raster/document formats are recognised, so
 * an HTML or SVG error page can never be mistaken for a download.
 */
export function sniffContentType(bytes: Uint8Array): string | null {
  for (const { contentType, test } of CONTENT_TYPE_SIGNATURES) {
    if (test(bytes)) return contentType;
  }
  return null;
}

function typeAllowed(contentType: string, allowed: readonly string[]): boolean {
  return allowed.some((type) => contentType.startsWith(type));
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
      if (attempt < o.retries! - 1) await delay(backoffFor(e, attempt), o.signal);
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
  return (await fetchAsset(url, opts)).bytes;
}

export interface FetchedAsset {
  bytes: Uint8Array;
  /** The declared `Content-Type`, or the magic-byte type when the host sends none. */
  contentType: string | null;
}

/** A rejection that retrying cannot fix, so the backoff loop stops immediately. */
class PermanentAssetError extends Error {}

/** Fetch a binary asset and report which media type the bytes actually are. */
export async function fetchAsset(
  url: string,
  opts: FetchOptions = {},
): Promise<FetchedAsset> {
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
      const bytes = new Uint8Array(await readResponseBytes(response, o.maxBytes ?? 10 * 1024 * 1024));
      const declared = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || null;
      const allowed = o.allowedContentTypes;
      if (allowed?.length) {
        if (declared && typeAllowed(declared, allowed)) return { bytes, contentType: declared };
        // A missing or mislabelled header still has to yield a real image: sniff
        // the payload so a 200 HTML error page is rejected but a valid file is not.
        const sniffed = sniffContentType(bytes);
        if (sniffed && typeAllowed(sniffed, allowed)) return { bytes, contentType: sniffed };
        throw new PermanentAssetError(
          `Unexpected content type for ${url} (declared: ${declared ?? "none"}, detected: ${sniffed ?? "unknown"})`,
        );
      }
      return { bytes, contentType: declared ?? sniffContentType(bytes) };
    } catch (error) {
      if (o.signal?.aborted) throw abortError();
      lastErr = error;
      if (error instanceof PermanentAssetError) break;
      const message = String(error);
      if (/HTTP 4\d\d/.test(message) && !message.includes("429")) break;
      if (attempt < o.retries! - 1) await delay(backoffFor(error, attempt), o.signal);
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

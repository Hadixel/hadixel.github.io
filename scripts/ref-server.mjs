#!/usr/bin/env node
/**
 * Serve the catalogue to the Flow page so a reference photo can be fetched and dropped.
 *
 * A plain `python3 -m http.server` is not enough: the page runs on flow.google.com, so a
 * cross-origin fetch of a loopback URL is blocked and throws "Failed to fetch". The upload then
 * silently does nothing — the driver reports success and the model generates a scene with no
 * product in it, which is exactly the lookalike the brief forbids.
 *
 * Access-Control-Allow-Origin: * is safe here: the server binds to 127.0.0.1 only, serves the
 * repository's own public assets, and exists for the lifetime of one generation run.
 *
 * Usage: node scripts/ref-server.mjs [--port 8899] [--root apps/store/public]
 */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, normalize, resolve, sep } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const PORT = Number(arg("port", process.env.FLOW_REF_PORT ?? 8899));
const BASE = resolve(ROOT, arg("root", "apps/store/public"));

const TYPES = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".gif": "image/gif", ".avif": "image/avif", ".svg": "image/svg+xml",
};

createServer((req, res) => {
  // The page is on a different origin, so this header is what makes the fetch possible.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }

  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
  // normalize plus the prefix check keeps a crafted path from escaping the served directory.
  const file = resolve(BASE, normalize(rel));
  if (file !== BASE && !file.startsWith(BASE + sep)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  let st;
  try { st = statSync(file); } catch { res.writeHead(404).end("not found"); return; }
  if (!st.isFile()) { res.writeHead(404).end("not found"); return; }

  res.writeHead(200, {
    "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "Content-Length": st.size,
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`reference server on http://127.0.0.1:${PORT} -> ${BASE}`);
});

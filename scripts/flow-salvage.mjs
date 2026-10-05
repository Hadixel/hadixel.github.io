#!/usr/bin/env node
/**
 * Salvage every image Flow has already generated, newest first, skipping ones already on disk.
 *
 * The generation driver writes each shot as it lands, but a run can die after Flow has produced
 * the image and before the driver saved it — the quota closing mid-run, a timeout, a killed
 * process. The page keeps the results, so nothing is lost: this walks them and writes out the
 * ones that are still missing.
 *
 * Identification is by rendered size, never by appearance. The upload grid is full of 1080x1080
 * product collages, and each drop adds another, so "the newest <img>" is a product photo on
 * white unless a size check comes first. Generated output is 1376x768 for 16:9 and 1024x1024 or
 * 1080x1080 for 1:1, and only the 1:1 ones are worth taking from the square pool.
 *
 * Usage: node flow-salvage.mjs <out-dir> [--ratio 16:9|1:1] [--limit N]
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outDir = process.argv[2];
if (!outDir) { console.error("usage: node flow-salvage.mjs <out-dir> [--ratio 16:9|1:1] [--limit N]"); process.exit(2); }
const argv = process.argv.slice(3);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const ratio = arg("ratio", "16:9");
const limit = Number(arg("limit", 40));

const list = await (await fetch(`${process.env.FLOW_CDP ?? "http://127.0.0.1:9223"}/json/list`)).json();
const page = list.find((t) => t.type === "page" && /flow\.google/.test(t.url));
if (!page) { console.error("no Flow tab"); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const p = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression, aw = false) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: aw })).result?.result?.value;

const rows = String(await ev(`(function(){
  var a=[].slice.call(document.querySelectorAll('img')).filter(function(x){return /flow-content/.test(x.src);});
  var o=[];
  for(var i=0;i<a.length;i++) o.push(a[i].src+'|'+a[i].naturalWidth+'x'+a[i].naturalHeight);
  return o.join('\\n');
})()`) ?? "").split("\n").filter(Boolean).map((l) => l.split("|"));

// A catalogue product shot and a generated room can share the same dimensions, so dimensions
// alone mislabels: three of the "1:1 tiles" an earlier version salvaged were the oven and
// air-fryer catalogue photos on white, not scenes. The reliable cheap discriminator is file
// size — a room full of cabinets, tiles and shadow is an incompressible mess landing well above
// 200KB, while a product centred on flat white compresses far smaller. Anything under the
// threshold is a product shot and is skipped, so it can never reach the editorial folder as a
// "scene".
const SCENE_MIN_BYTES = Number(process.env.FLOW_SCENE_MIN ?? 200000);

// Flow renders 16:9 output at 1376x768 and 1:1 at 1024x1024 or 1080x1080. Both are well clear of
// the smaller sizes an upload thumbnail uses, which is what makes a size gate meaningful here.
const isLandscape = (dim) => { const m = dim.match(/^(\d+)x(\d+)$/); return !!m && Number(m[1]) > 1200 && Number(m[2]) > 700; };
const isSquare = (dim) => { const m = dim.match(/^(\d+)x(\d+)$/); return !!m && m[1] === m[2] && Number(m[1]) >= 1000 && Number(m[1]) <= 1200; };
mkdirSync(outDir, { recursive: true });
const existing = new Set(readdirSync(outDir).filter((f) => f.endsWith(".jpg")));



let n = 0;
let idx = 0;

for (const [src, dim] of rows) {
  if (n >= limit) break;
  idx++;
  const want = ratio === "1:1" ? isSquare(dim) : isLandscape(dim);
  if (!want) continue;

  const name = ratio === "1:1" ? `salvaged-square-${String(idx).padStart(2, "0")}.jpg` : `salvaged-${String(idx).padStart(2, "0")}.jpg`;
  if (existing.has(name)) { n++; continue; }

  const b64 = await ev(`(async function(){
    var r = await fetch(${JSON.stringify(src)});
    if(!r.ok) return '';
    var b = new Uint8Array(await r.arrayBuffer());
    var s=''; for(var i=0;i<b.length;i++) s+=String.fromCharCode(b[i]);
    return btoa(s);
  })()`, true);
  if (!b64) continue;

  const buf = Buffer.from(b64, "base64");
  // See SCENE_MIN_BYTES above: a product shot on white compresses small and is not a scene.
  if (buf.length < SCENE_MIN_BYTES) {
    console.log(`  skip ${name} (${buf.length}B — a product shot on white, not a scene)`);
    continue;
  }
  writeFileSync(resolve(outDir, name), buf);
  console.log(`wrote ${name} (${buf.length}B, ${dim})`);
  n++;
}

console.log(`\n${n} ${ratio} candidate(s) available`);
process.exit(0);

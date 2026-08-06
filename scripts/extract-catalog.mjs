// One-off: parse legacy-store/src/assets/assets.js products array + image imports
// into a portable catalog.json (013 migration input). Run: node scripts/extract-catalog.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url)) + "/..";
const SRC = join(ROOT, "apps/legacy-store/src/assets/assets.js");
const OUT = join(ROOT, "packages/db/seed/catalog.json");
const IMG_DIR = resolve(ROOT, "apps/legacy-store/src/assets");

const src = readFileSync(SRC, "utf8");

// 1) Build map: import identifier -> absolute file path
const imports = {};
const importRe = /import\s+([A-Za-z0-9_$]+)\s+from\s+['"]([^'"]+)['"]/g;
let m;
while ((m = importRe.exec(src))) imports[m[1]] = resolve(IMG_DIR, m[2]);

// 2) Find the products array literal bounds
const start = src.indexOf("export const products");
const arrStart = src.indexOf("[", start);
let depth = 0, i = arrStart, inStr = false, strCh = "", end = -1;
for (; i < src.length; i++) {
  const ch = src[i];
  if (inStr) { if (ch === strCh && src[i - 1] !== "\\") inStr = false; continue; }
  if (ch === '"' || ch === "'" || ch === "`") { inStr = true; strCh = ch; continue; }
  if (ch === "[") depth++;
  if (ch === "]") { depth--; if (depth === 0) { end = i + 1; break; } }
}
if (end < 0) throw new Error("could not find products array end");
const literal = src.slice(arrStart, end);

// 3) Replace image identifiers with their absolute paths (as JSON strings),
// then evaluate the array literal into plain JS objects.
const substituted = literal.replace(
  /\b([A-Za-z_$][A-Za-z0-9_$]*)\b/g,
  (tok) => (tok in imports ? JSON.stringify(imports[tok]) : tok),
);
const products = (0, eval)(substituted);

// 4) Validate every image path exists
let missing = 0;
for (const p of products) {
  for (const img of p.image ?? []) {
    if (typeof img === "string" && img.startsWith("/") && !existsSync(img)) {
      missing++;
      console.log("MISSING:", img);
    }
  }
}

writeFileSync(OUT, JSON.stringify(products, null, 2));
console.log("catalog written:", OUT);
console.log("products:", products.length, "| missing images:", missing);
console.log("sample:", products[0]._id, "|", products[0].image.length, "images");
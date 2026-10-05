/**
 * Audit every image the storefront can serve from a page block or a post cover
 * and report any path with no file behind it. A missing file is a broken image
 * on the page, so this is the check that keeps editorial wiring honest.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../src/prisma/index.js";

/* Anchored to this file, not process.cwd(): the check has to find the same files
   whichever directory the script is invoked from. */
const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../store/public");
const prisma = db();

/** Walk any block tree and collect every string that looks like a served image. */
function imageRefs(value: unknown, path = ""): Array<{ ref: string; at: string }> {
  if (typeof value === "string") {
    return /^\/(editorial|products|uploads)\//.test(value) ? [{ ref: value, at: path }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => imageRefs(v, `${path}[${i}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => imageRefs(v, path ? `${path}.${k}` : k));
  }
  return [];
}

let checked = 0;
const missing: string[] = [];

const pages = await prisma.page.findMany({ select: { slug: true, publishedBlocks: true, draftBlocks: true } });
for (const page of pages) {
  for (const [which, blocks] of [["published", page.publishedBlocks], ["draft", page.draftBlocks]] as const) {
    for (const { ref, at } of imageRefs(blocks, `${page.slug}.${which}`)) {
      checked++;
      if (!existsSync(join(PUBLIC_DIR, ref))) missing.push(`${page.slug} (${which}) ${at} -> ${ref}`);
    }
  }
}

const posts = await prisma.post.findMany({ select: { slug: true, coverImage: true } });
for (const post of posts) {
  if (!post.coverImage) continue;
  checked++;
  if (!existsSync(join(PUBLIC_DIR, post.coverImage))) missing.push(`post ${post.slug} -> ${post.coverImage}`);
}

for (const model of ["menu", "menuItem", "menuPromo"] as const) {
  const rows = (await (prisma as never as Record<string, { findMany: (a: object) => Promise<unknown[]> }>)[model]
    .findMany()) as Array<Record<string, unknown>>;
  rows.forEach((row, i) => {
    for (const { ref, at } of imageRefs(row, `${model}[${i}]`)) {
      checked++;
      if (!existsSync(join(PUBLIC_DIR, ref))) missing.push(`${model}[${i}] ${at} -> ${ref}`);
    }
  });
}

console.log(`public dir: ${PUBLIC_DIR}`);
console.log(`pages: ${pages.length}, posts: ${posts.length}`);
console.log(`image references checked: ${checked}`);
console.log(`missing files: ${missing.length}`);
for (const m of missing) console.log(`  MISSING ${m}`);

const onEditorial = posts.filter((p) => p.coverImage?.startsWith("/editorial/")).length;
const onProduct = posts.filter((p) => p.coverImage?.startsWith("/products/")).length;
console.log(`\nblog covers: ${onEditorial} editorial, ${onProduct} still product photos, ${posts.length - onEditorial - onProduct} none`);
await prisma.$disconnect();
process.exit(missing.length ? 1 : 0);

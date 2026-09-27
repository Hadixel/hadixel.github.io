// Prepare product images for local serving + update DB variant.images.
// 013 key pattern: products/{slug}/variant-{color}/img-{index}.jpg (immutable keys).
// With S3_* env configured this would upload via @kmodern/adapters; locally it
// copies into apps/store/public/products and rewrites variant.images to /products/...
// Run: pnpm --filter @kmodern/api db:images
import "dotenv/config";
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { db } from "../src/prisma/client.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const catalog = JSON.parse(readFileSync(join(HERE, "catalog.json"), "utf8")) as Array<{
  _id: string;
  slug: string; // Latin URL slug (display name is Persian)
  colors: string[];
  image: string[];
}>;

const COLOR_TOKENS = ["black", "white", "gray", "beige", "silver", "steel"];
const PUBLIC_DIR = join(ROOT, "apps/store/public/products");

async function materializeImage(src: string, dest: string): Promise<void> {
  if (existsSync(dest)) return;
  if (/^https?:\/\//i.test(src)) {
    const response = await fetch(src, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; kmodern-seed/0.1)" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} while downloading ${src}`);
    writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
    return;
  }
  copyFileSync(src, dest);
}

async function main() {
  const prisma = db();
  try {
    let copied = 0;
    for (const prod of catalog) {
      const slug = prod.slug;
      const byColor: Record<string, string[]> = {};
      const shared: string[] = [];
      for (const img of prod.image) {
        const base = basename(img).replace(extname(img), "");
        const match = COLOR_TOKENS.find((t) => base.includes(t));
        if (match) (byColor[match] ??= []).push(img);
        else shared.push(img);
      }
      for (const color of prod.colors) {
        const key = color.toLowerCase();
        const images = [...shared, ...(byColor[key] ?? [])];
        const sku = `${prod._id ? "DATEES" : "BRAND"}-${prod._id}-${key.toUpperCase()}`;
        const urls = images.map((src, i) => {
          const ext = extname(src) || ".jpg";
          const dest = join(PUBLIC_DIR, slug, `variant-${key}`, `img-${i + 1}${ext}`);
          mkdirSync(dirname(dest), { recursive: true });
          await materializeImage(src, dest);
          copied++;
          return `/products/${slug}/variant-${key}/img-${i + 1}${ext}`;
        });
        await prisma.variant.updateMany({
          where: { sku },
          data: { images: urls },
        });
      }
    }
    console.log(
      `image urls rewritten for ${catalog.length} products; ${copied} files ensured in apps/store/public/products`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

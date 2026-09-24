// 013 migration + seed: catalog.json -> production schema.
// Run: pnpm --filter @kmodern/db db:seed   (requires DATABASE_URL live)
// Idempotent: upserts categories/products/variants by slug/sku.
//
// Image strategy: records the physical path from catalog.json. With ParsPack
// S3 configured (S3_*), uploads happen via the storage adapter — the path in
// catalog.json is the local source. Without S3, the store app serves images
// from apps/store/public/products (copy step in prepare-images).

import "dotenv/config";
import { db } from "../src/client.js";
import { readFileSync } from "node:fs";
import { dirname, join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import slugifyPkg from "slugify";

const slugify = (s: string) =>
  slugifyPkg(s, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });

const HERE = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(HERE, "catalog.json"), "utf8")) as CatalogProduct[];

interface CatalogProduct {
  _id: string;
  slug: string; // Latin URL slug — display name is Persian
  name: string;
  brand: string;
  category: string;
  subCategory: string;
  colors: string[];
  price: number;
  bestSeller: boolean;
  date: number;
  image: string[]; // absolute local paths
  description: string;
  features: string[];
  specs: { label: string; value: string }[];
}

// ---- category weightKg per root category (011 requires > 0) ----
const WEIGHTS: Record<string, number> = {
  sink: 12,
  "air-fryer": 6,
  stove: 18,
  oven: 35,
  hood: 18,
};

// Persian display names for root categories and subcategories (URL slugs stay Latin)
const FA_ROOTS: Record<string, string> = {
  sink: "سینک",
  hood: "هود",
  oven: "فر",
  stove: "اجاق گاز",
  "air-fryer": "سرخ‌کن",
};

const FA_SUBS: Record<string, string> = {
  "double-bowl": "دولگن",
  "built-in": "توکار",
  chimney: "شومینه‌ای",
  concealed: "مخفی",
  wall: "دیواری",
  steel: "استیل",
  granite: "گرانیتی",
  glass: "شیشه‌ای",
  freestanding: "رومیزی",
  "dual-basket": "دوسبد",
};

// Persian display names + finish hex for Color dots (CONTEXT.md: Color is
// the named finish — استیل، مشکی); tokens stay Latin for image paths/SKUs.
const COLOR_TOKENS = ["black", "white", "gray", "beige", "silver", "steel"];
const FA_COLORS: Record<string, string> = {
  black: "مشکی",
  white: "سفید",
  gray: "طوسی",
  beige: "کرم",
  silver: "نقره‌ای",
  steel: "استیل",
};
const COLOR_HEX: Record<string, string> = {
  black: "#1C1917",
  white: "#FFFFFF",
  gray: "#6B7280",
  beige: "#D6C3A1",
  silver: "#C0C0C0",
  steel: "#A8AEB7",
};

const IMAGS_BASE = join(HERE, "../../../apps/legacy-store/src/assets");

async function main() {
  const prisma = db();
  try {
    await seedCatalog(prisma);
    console.log("seed complete");
  } finally {
    await prisma.$disconnect();
  }
}

async function seedCatalog(prisma: ReturnType<typeof db>) {
  // 1. Root categories (parent) + subcategories (child), 2-level tree (013)
  const roots: Record<string, string> = {}; // category -> id
  const cats: Record<string, string> = {}; // `${category}/${subCategory}` -> id

  for (const prod of catalog) {
    if (!(prod.category in roots)) {
      const slug = `${prod.category}-datees`;
      const existing = await prisma.category.findUnique({ where: { slug } });
      const cat = existing ?? (await prisma.category.create({
        data: { name: prod.category, slug, weightKg: WEIGHTS[prod.category] ?? 1, sortOrder: 0 },
      }));
      roots[prod.category] = cat.id;
      await prisma.category.update({
        where: { id: cat.id },
        data: { name: FA_ROOTS[prod.category] ?? prod.category },
      });
      // spec fields derived from first product's specs (category-defined)
      const labels = new Set<string>();
      for (const s of prod.specs) {
        labels.add(s.label);
        try {
          await prisma.categorySpecField.upsert({
            where: { categoryId_name: { categoryId: cat.id, name: s.label } },
            update: {},
            create: { categoryId: cat.id, name: s.label, type: specType(s.value) },
          });
        } catch { /* duplicate in same run */ }
      }
      // drop spec fields left over from a previous (e.g. English) labeling
      const stale = await prisma.categorySpecField.findMany({ where: { categoryId: cat.id } });
      for (const f of stale) {
        if (!labels.has(f.name)) {
          await prisma.productSpecValue.deleteMany({ where: { specFieldId: f.id } });
          await prisma.categorySpecField.delete({ where: { id: f.id } });
        }
      }
    }
    const key = `${prod.category}/${prod.subCategory}`;
    if (!(key in cats)) {
      const slug = slugify(`${prod.category}-${prod.subCategory}`);
      const exists = await prisma.category.findUnique({ where: { slug } });
      const child = exists ?? (await prisma.category.create({
        data: {
          name: prod.subCategory,
          slug,
          parentId: roots[prod.category],
          weightKg: WEIGHTS[prod.category] ?? 1,
        },
      }));
      await prisma.category.update({
        where: { id: child.id },
        data: { name: FA_SUBS[prod.subCategory] ?? prod.subCategory },
      });
      cats[key] = child.id;
    }
  }

  // 2. Products + variants (color = full variant)
  let variantCount = 0;
  for (const prod of catalog) {
    // slug stays Latin (URLs + image dirs depend on it); display text is Persian
    const productId = (
      await prisma.product.upsert({
        where: { slug: prod.slug },
        update: {
          name: prod.name,
          description: prod.description,
          features: prod.features,
          extraSpecs: { specs: prod.specs },
        },
        create: {
          slug: prod.slug,
          name: prod.name,
          brand: prod.brand ?? "Datees",
          model: prod._id,
          categoryId: cats[`${prod.category}/${prod.subCategory}`],
          description: prod.description,
          features: prod.features,
          extraSpecs: { specs: prod.specs },
          status: "PUBLISHED",
          allowBackorder: true,
        },
      })
    ).id;

    // split images by color token; shared/unmatched go to every variant (013)
    // Emit the canonical 013 URL convention directly (products/{slug}/variant-{color}/img-N)
    // so a bare db:seed never re-clobbers URLs that db:images rewrote.
    const byColor: Record<string, string[]> = {};
    const shared: string[] = [];
    for (const img of prod.image) {
      const base = basenameStripped(img);
      const match = COLOR_TOKENS.find((t) => base.includes(t));
      if (match) (byColor[match] ??= []).push(img);
      else shared.push(img);
    }

    for (const color of prod.colors) {
      const key = color.toLowerCase();
      const images = [...shared, ...(byColor[key] ?? [])].map(
        (src, i) => `/products/${prod.slug}/variant-${key}/img-${i + 1}${extname(src) || ".jpg"}`,
      );
      const sku = `${(prod.brand ?? "BRAND").toUpperCase()}-${prod._id}-${key.toUpperCase()}`;
      await prisma.variant.upsert({
        where: { sku },
        update: { price: prod.price, images, allowBackorder: true, colorName: FA_COLORS[key] ?? color, colorCode: COLOR_HEX[key] ?? null },
        create: {
          productId,
          colorName: FA_COLORS[key] ?? color,
          colorCode: COLOR_HEX[key] ?? null,
          sku,
          price: prod.price,
          stock: 0,
          reserved: 0,
          allowBackorder: true,
          images,
        },
      });
      variantCount++;
    }

    // copy specs as ProductSpecValue keyed to the ROOT category's fields
    // (fields live on roots; names repeat across roots — never write cross-category)
    const thisCatId = roots[prod.category];
    for (const s of prod.specs) {
      const fields = await prisma.categorySpecField.findMany({
        where: { name: s.label, categoryId: thisCatId },
      });
      for (const f of fields) {
        try {
          await prisma.productSpecValue.upsert({
            where: { productId_specFieldId: { productId, specFieldId: f.id } },
            update: { value: s.value },
            create: { productId, specFieldId: f.id, value: s.value },
          });
        } catch { /* dup */ }
      }
    }
  }
  console.log(`seeded ${Object.keys(roots).length} roots, ${Object.keys(cats).length} subcats, ${catalog.length} products, ${variantCount} variants`);
}

function basenameStripped(p: string) {
  const base = p.split("/").pop() ?? p;
  return base.replace(extname(base), "");
}

function specType(v: string): string {
  if (/^\d+(\.\d+)?$/.test(v)) return "number";
  if (/^(yes|no|true|false)$/i.test(v)) return "boolean";
  return "string";
}

main().catch((e) => { console.error(e); process.exit(1); });
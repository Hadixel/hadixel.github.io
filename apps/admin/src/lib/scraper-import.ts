import { db } from "@kmodern/db";
import { preparedVariantImages, prepareScrapedImages } from "@/lib/scraper-images";
import type { ScraperCatalogItem } from "@/lib/scraper-types";

const ROOT_META: Record<string, { name: string; weightKg: number }> = {
  sink: { name: "سینک", weightKg: 12 },
  hood: { name: "هود", weightKg: 18 },
  oven: { name: "فر", weightKg: 35 },
  stove: { name: "اجاق گاز", weightKg: 18 },
  "air-fryer": { name: "سرخ‌کن", weightKg: 6 },
};

const SUB_META: Record<string, string> = {
  "double-bowl": "دولگن",
  "built-in": "توکار",
  chimney: "شومینه‌ای",
  steel: "استیل",
  glass: "شیشه‌ای",
  "dual-basket": "دوسبد",
};

const COLOR_META: Record<string, { name: string; code: string }> = {
  black: { name: "مشکی", code: "#1C1917" },
  white: { name: "سفید", code: "#FFFFFF" },
  gray: { name: "طوسی", code: "#6B7280" },
  beige: { name: "کرم", code: "#D6C3A1" },
  silver: { name: "نقره‌ای", code: "#C0C0C0" },
  steel: { name: "استیل", code: "#A8AEB7" },
};

export interface ScraperImportResult {
  products: number;
  variants: number;
  images: number;
  imageErrors: number;
  status: "DRAFT" | "PUBLISHED";
}

function specType(value: string): string {
  if (/^\d+(\.\d+)?$/.test(value)) return "number";
  if (/^(yes|no|true|false)$/i.test(value)) return "boolean";
  return "string";
}

function cleanList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export async function importScrapedCatalog(
  items: ScraperCatalogItem[],
  publish: boolean,
): Promise<ScraperImportResult> {
  if (!items.length) {
    return { products: 0, variants: 0, images: 0, imageErrors: 0, status: publish ? "PUBLISHED" : "DRAFT" };
  }

  const preparedImages = await prepareScrapedImages(items);

  return db().$transaction(async (tx) => {
    let variantCount = 0;

    for (const item of items) {
      const rootMeta = ROOT_META[item.category];
      const subName = SUB_META[item.subCategory];
      if (!rootMeta || !subName) {
        throw new Error(`دسته‌بندی پشتیبانی‌نشده برای ${item.slug}: ${item.category}/${item.subCategory}`);
      }
      if (!item.slug || !/^[a-z0-9][a-z0-9-]*$/.test(item.slug)) {
        throw new Error(`اسلاگ نامعتبر برای ${item.name}`);
      }

      const root = await tx.category.upsert({
        where: { slug: `${item.category}-datees` },
        update: { name: rootMeta.name, weightKg: rootMeta.weightKg },
        create: {
          name: rootMeta.name,
          slug: `${item.category}-datees`,
          weightKg: rootMeta.weightKg,
        },
      });
      const child = await tx.category.upsert({
        where: { slug: `${item.category}-${item.subCategory}` },
        update: { name: subName, parentId: root.id, weightKg: rootMeta.weightKg },
        create: {
          name: subName,
          slug: `${item.category}-${item.subCategory}`,
          parentId: root.id,
          weightKg: rootMeta.weightKg,
        },
      });

      const product = await tx.product.upsert({
        where: { slug: item.slug },
        update: {
          name: item.name,
          brand: item.brand || "Datees",
          model: item._id || item.slug,
          categoryId: child.id,
          description: item.description || null,
          features: cleanList(item.features),
          extraSpecs: { specs: item.specs } as never,
          status: publish ? "PUBLISHED" : "DRAFT",
          allowBackorder: true,
        },
        create: {
          slug: item.slug,
          name: item.name,
          brand: item.brand || "Datees",
          model: item._id || item.slug,
          categoryId: child.id,
          description: item.description || null,
          features: cleanList(item.features),
          extraSpecs: { specs: item.specs } as never,
          status: publish ? "PUBLISHED" : "DRAFT",
          allowBackorder: true,
        },
      });

      const fields = new Map<string, string>();
      for (const spec of item.specs) {
        const label = spec.label.trim();
        const value = spec.value.trim();
        if (!label || !value || fields.has(label)) continue;
        const field = await tx.categorySpecField.upsert({
          where: { categoryId_name: { categoryId: child.id, name: label } },
          update: { type: specType(value) },
          create: { categoryId: child.id, name: label, type: specType(value) },
        });
        fields.set(label, field.id);
        await tx.productSpecValue.upsert({
          where: { productId_specFieldId: { productId: product.id, specFieldId: field.id } },
          update: { value },
          create: { productId: product.id, specFieldId: field.id, value },
        });
      }

      const colors = cleanList(item.colors).filter((color) => COLOR_META[color]);
      if (!colors.length) colors.push("steel");
      const price = Number.isFinite(item.price) && item.price >= 0 ? item.price : 0;
      const brand = (item.brand || "Datees").toUpperCase();
      const model = (item._id || item.slug).toUpperCase();

      for (const color of colors) {
        const images = preparedVariantImages(preparedImages, item.slug, color);
        const sku = `${brand}-${model}-${color.toUpperCase()}`;
        const existing = await tx.variant.findUnique({ where: { sku } });
        if (existing && existing.productId !== product.id) {
          throw new Error(`SKU تکراری متعلق به محصول دیگر است: ${sku}`);
        }
        const colorMeta = COLOR_META[color];
        await tx.variant.upsert({
          where: { sku },
          update: {
            colorName: colorMeta.name,
            colorCode: colorMeta.code,
            price,
            allowBackorder: true,
            images,
          },
          create: {
            productId: product.id,
            sku,
            colorName: colorMeta.name,
            colorCode: colorMeta.code,
            price,
            stock: 0,
            allowBackorder: true,
            images,
          },
        });
        variantCount += 1;
      }
    }

    return {
      products: items.length,
      variants: variantCount,
      images: preparedImages.ready,
      imageErrors: preparedImages.errors,
      status: publish ? "PUBLISHED" : "DRAFT",
    };
  });
}

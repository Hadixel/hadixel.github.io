import { db } from "@kmodern/db";
import { normalizeFa } from "@kmodern/scraper";
import { preparedVariantImages, prepareScrapedImages } from "@/lib/scraper-images";
import type { ScraperCatalogEdit, ScraperCatalogItem } from "@/lib/scraper-types";

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
  concealed: "مخفی",
  wall: "دیواری",
  steel: "استیل",
  granite: "گرانیتی",
  glass: "شیشه‌ای",
  freestanding: "رومیزی",
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

const CATEGORY_SUBCATEGORIES: Record<string, string[]> = {
  sink: ["steel", "granite"],
  hood: ["chimney", "concealed", "wall", "glass"],
  oven: ["built-in", "steel", "glass"],
  stove: ["built-in", "freestanding"],
  "air-fryer": ["dual-bowl", "double-bowl"],
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

function productExtraSpecs(item: ScraperCatalogItem): Record<string, unknown> {
  return {
    specs: item.specs,
    ...(item.priceSourceId ? {
      scraperPrice: {
        sourceId: item.priceSourceId,
        sourceUrl: item.priceSourceUrl,
        currency: item.priceCurrency ?? "TOMAN",
        fetchedAt: item.priceFetchedAt,
        inStock: item.priceInStock,
        byColor: item.priceByColor,
      },
    } : {}),
  };
}

function brandSlug(value: string): string {
  return value.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "datees";
}

function boundedText(value: unknown, field: string, max: number, required = false): string {
  if (typeof value !== "string") throw new Error(`invalid_${field}`);
  const text = normalizeFa(value).trim();
  if (required && !text) throw new Error(`invalid_${field}`);
  if (text.length > max) throw new Error(`${field}_too_long`);
  return text;
}

function parseEdit(value: unknown, base: ScraperCatalogItem): ScraperCatalogEdit {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`invalid_edit_${base.slug}`);
  const input = value as Record<string, unknown>;
  const allowed = new Set(["name", "price", "description", "features", "specs", "category", "subCategory"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error(`uneditable_field:${key}`);
  }

  const edit: ScraperCatalogEdit = {};
  if (input.name !== undefined) edit.name = boundedText(input.name, "name", 300, true);
  if (input.description !== undefined) edit.description = boundedText(input.description, "description", 5000);
  if (input.price !== undefined) {
    if (typeof input.price !== "number" || !Number.isFinite(input.price) || input.price < 0 || input.price > 1_000_000_000_000) {
      throw new Error(`invalid_price_${base.slug}`);
    }
    edit.price = input.price;
  }
  if (input.features !== undefined) {
    if (!Array.isArray(input.features) || input.features.length > 50) throw new Error(`invalid_features_${base.slug}`);
    edit.features = cleanList(input.features.map((feature) => boundedText(feature, "feature", 300, true)));
  }
  if (input.specs !== undefined) {
    if (!Array.isArray(input.specs) || input.specs.length > 100) throw new Error(`invalid_specs_${base.slug}`);
    const specs: Array<{ label: string; value: string }> = [];
    for (const raw of input.specs) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`invalid_specs_${base.slug}`);
      const spec = raw as Record<string, unknown>;
      const label = boundedText(spec.label, "spec_label", 120, true);
      const value = boundedText(spec.value, "spec_value", 500, true);
      if (!specs.some((item) => item.label === label)) specs.push({ label, value });
    }
    edit.specs = specs;
  }

  const category = input.category === undefined ? base.category : boundedText(input.category, "category", 80, true);
  const requestedSub = input.subCategory === undefined
    ? base.subCategory
    : boundedText(input.subCategory, "subCategory", 80, true);
  const validSubcategories = CATEGORY_SUBCATEGORIES[category];
  if (!validSubcategories) throw new Error(`invalid_category_${base.slug}`);
  const subCategory = input.subCategory === undefined && !validSubcategories.includes(requestedSub)
    ? validSubcategories[0]
    : requestedSub;
  if (!validSubcategories.includes(subCategory)) throw new Error(`invalid_subcategory_${base.slug}`);
  if (input.category !== undefined) edit.category = category;
  if (input.subCategory !== undefined || subCategory !== base.subCategory) edit.subCategory = subCategory;

  return edit;
}

/** Apply a narrow, server-owned edit overlay to canonical private catalog items. */
export function applyScraperCatalogEdits(
  items: ScraperCatalogItem[],
  rawEdits: Record<string, unknown>,
): ScraperCatalogItem[] {
  const bySlug = new Map(items.map((item) => [item.slug, item]));
  for (const slug of Object.keys(rawEdits)) {
    if (!bySlug.has(slug)) throw new Error(`unknown_edit_slug:${slug}`);
  }
  return items.map((item) => {
    const raw = rawEdits[item.slug];
    if (raw === undefined) return item;
    const edit = parseEdit(raw, item);
    const merged = { ...item, ...edit };
    if (edit.price !== undefined) {
      delete merged.priceByColor;
      delete merged.priceCurrency;
      delete merged.priceFetchedAt;
      delete merged.priceInStock;
      delete merged.priceSourceId;
      delete merged.priceSourceUrl;
    }
    return merged;
  });
}

export async function importScrapedCatalog(
  items: ScraperCatalogItem[],
  publish: boolean,
): Promise<ScraperImportResult> {
  if (!items.length) {
    return { products: 0, variants: 0, images: 0, imageErrors: 0, status: publish ? "PUBLISHED" : "DRAFT" };
  }
  if (publish) {
    const missingPrice = items.find((item) => !Number.isFinite(item.price) || item.price <= 0);
    if (missingPrice) throw new Error(`قیمت برای انتشار ${missingPrice.name} الزامی است`);
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

      const brandKey = brandSlug(item.brand || "Datees");
      const rootSlug = brandKey === "datees" ? `${item.category}-datees` : `${item.category}-${brandKey}`;
      const childSlug = brandKey === "datees"
        ? `${item.category}-${item.subCategory}`
        : `${item.category}-${brandKey}-${item.subCategory}`;
      const root = await tx.category.upsert({
        where: { slug: rootSlug },
        update: { name: rootMeta.name, weightKg: rootMeta.weightKg },
        create: {
          name: rootMeta.name,
          slug: rootSlug,
          weightKg: rootMeta.weightKg,
        },
      });
      const child = await tx.category.upsert({
        where: { slug: childSlug },
        update: { name: subName, parentId: root.id, weightKg: rootMeta.weightKg },
        create: {
          name: subName,
          slug: childSlug,
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
          extraSpecs: productExtraSpecs(item) as never,
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
          extraSpecs: productExtraSpecs(item) as never,
          status: publish ? "PUBLISHED" : "DRAFT",
          allowBackorder: true,
        },
      });

      // Re-imports are authoritative for the selected product's spec set.
      // This removes specs deleted during review while staying inside the transaction.
      await tx.productSpecValue.deleteMany({ where: { productId: product.id } });
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
      const defaultPrice = Number.isFinite(item.price) && item.price >= 0 ? item.price : 0;
      const brand = (item.brand || "Datees").toUpperCase();
      const model = (item._id || item.slug).toUpperCase();
      const desiredSkus = colors.map((color) => `${brand}-${model}-${color.toUpperCase()}`);
      const existingVariants = await tx.variant.findMany({ where: { productId: product.id }, select: { sku: true } });
      const staleSkus = existingVariants.map((variant) => variant.sku).filter((sku) => !desiredSkus.includes(sku));
      if (staleSkus.length) {
        await tx.variant.deleteMany({ where: { productId: product.id, sku: { in: staleSkus } } });
      }

      for (const color of colors) {
        const images = preparedVariantImages(preparedImages, item.slug, color);
        const colorPrice = item.priceByColor?.[color];
        const price = typeof colorPrice === "number" && Number.isFinite(colorPrice) && colorPrice > 0
          ? colorPrice
          : defaultPrice;
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

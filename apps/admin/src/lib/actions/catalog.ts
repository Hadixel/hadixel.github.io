"use server";

// The product write, and only that.
//
// This file used to carry three features — products, categories and collections — and each of the
// other two has moved to a module of its own over the gateway (`category.ts`, `collection.ts`), leaving
// the product write as the last feature here. Criterion 4 asks for one file per feature; this is the
// one file that is not there yet, and it is the reason the others were moved out rather than copied.
//
// What is left is the panel's own product write, still against the data tier. It is the largest of the
// remaining writes — variant diffing, a compare-and-set on stock, the category's spec fields, a
// transaction of its own and an audit line written after it — and none of it is a copy of a rule the
// gateway holds. It becomes `product.ts` over a gateway route when the product write is migrated; what
// it is *not* is a file that also holds two other features' rules, which is what it was.

import { redirect } from "next/navigation";
import { db, $Enums } from "@kmodern/db";
import { seoSchema } from "@kmodern/schema";
import { actionContext } from "./ctx";
import { field } from "./form-helpers";
import { recordAudit } from "@/lib/audit";
import type { ActionState } from "./auth";

interface VariantInput {
  id?: string;
  colorName: string;
  colorCode?: string;
  sku: string;
  price: number;
  stock: number;
  allowBackorder: boolean;
  images: string[];
}

function parseJsonField<T>(raw: FormDataEntryValue | null, fallback: T): T | null {
  if (raw === null) return fallback;
  if (typeof raw !== "string" || raw.length > 500_000) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function nonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export async function saveProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, ip, ua } = await actionContext();
  const id = field(formData, "id");
  const slug = field(formData, "slug");
  const name = field(formData, "name");
  const brand = field(formData, "brand");
  const model = field(formData, "model");
  const categoryId = field(formData, "categoryId");
  const description = field(formData, "description");
  const status = field(formData, "status") as $Enums.ProductStatus;
  const allowBackorder = formData.get("allowBackorder") === "on";

  if (!name || !brand || !slug || !categoryId) return { error: "نام، برند، اسلاگ و دسته‌بندی الزامی است" };
  if ([name, brand, model, slug].some((value) => value.length > 300)) return { error: "اطلاعات محصول بیش از حد طولانی است" };
  if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)) return { error: "وضعیت نامعتبر است" };

  const features = field(formData, "features")
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  const extraSpecs = parseJsonField<Record<string, string>>(formData.get("extraSpecs"), {});
  const variants = parseJsonField<VariantInput[]>(formData.get("variants"), []);
  const specValues = parseJsonField<Record<string, string>>(formData.get("specValues"), {});
  if (!extraSpecs || Array.isArray(extraSpecs) || !variants || !Array.isArray(variants) || !specValues || Array.isArray(specValues)) {
    return { error: "داده‌های محصول نامعتبر است" };
  }

  if (!model.trim()) return { error: "مدل الزامی است" };
  if (variants.length > 100) return { error: "تعداد تنوع‌های محصول بیش از حد مجاز است" };
  const seenVariantIds = new Set<string>();
  const seenSkus = new Set<string>();
  for (const variant of variants) {
    if (!variant || typeof variant !== "object") return { error: "تنوع محصول نامعتبر است" };
    const price = Number(variant.price);
    const stock = Number(variant.stock);
    if (typeof variant.colorName !== "string" || typeof variant.sku !== "string" || !variant.sku.trim() || (variant.id !== undefined && typeof variant.id !== "string") || (variant.colorCode !== undefined && typeof variant.colorCode !== "string") || !nonNegativeNumber(price) || !Number.isInteger(stock) || stock < 0 || !Array.isArray(variant.images) || typeof variant.allowBackorder !== "boolean") {
      return { error: "SKU، قیمت و موجودی هر تنوع باید معتبر باشند" };
    }
    const sku = variant.sku.trim();
    if (seenSkus.has(sku)) return { error: `SKU تکراری: ${sku}` };
    seenSkus.add(sku);
    if (variant.id) {
      if (seenVariantIds.has(variant.id)) return { error: "شناسه تنوع تکراری است" };
      seenVariantIds.add(variant.id);
    }
  }

  const seoRaw = parseJsonField<Record<string, unknown>>(formData.get("seo"), {});
  if (!seoRaw || Array.isArray(seoRaw)) return { error: "فرم SEO نامعتبر است" };
  const seoParsed = seoSchema.safeParse(seoRaw);
  const seo = seoParsed.success ? seoParsed.data : undefined;
  if (!seoParsed.success && Object.keys(seoRaw).length > 0) {
    return { error: "فرم SEO نامعتبر است: " + (seoParsed.error.issues[0]?.message ?? "") };
  }

  const productData = {
    slug,
    name,
    brand,
    model,
    categoryId,
    description: description || null,
    features,
    extraSpecs: extraSpecs as never,
    status,
    allowBackorder,
    seo: (seo ?? null) as never,
  };

  let productId: string;
  try {
    productId = await db().$transaction(async (tx) => {
      const p = id
        ? await tx.product.update({ where: { id }, data: productData })
        : await tx.product.create({ data: productData });

      // variants: update kept in place, create new, delete dropped
      const keptIds: string[] = [];
      for (const v of variants) {
        const data = {
          colorName: v.colorName,
          colorCode: v.colorCode || null,
          sku: v.sku.trim(),
          price: Number(v.price),
          stock: Number(v.stock),
          allowBackorder: Boolean(v.allowBackorder),
          images: Array.isArray(v.images) ? v.images.filter((image): image is string => typeof image === "string" && Boolean(image.trim())) : [],
        };
        if (v.id) {
          const existing = await tx.variant.findFirst({ where: { id: v.id, productId: p.id } });
          if (!existing) throw new Error("VARIANT_OWNERSHIP");
          if (Number(v.stock) < existing.reserved) throw new Error("STOCK_RESERVED");
          // Compare the fields that affect inventory so a stale product form
          // cannot overwrite a concurrent order/stock adjustment.
          const updated = await tx.variant.updateMany({
            where: { id: v.id, productId: p.id, stock: existing.stock, reserved: existing.reserved },
            data,
          });
          if (updated.count !== 1) throw new Error("STOCK_CHANGED");
          keptIds.push(v.id);
        } else {
          const created = await tx.variant.create({ data: { productId: p.id, ...data } });
          keptIds.push(created.id);
        }
      }
      await tx.variant.deleteMany({
        where: { productId: p.id, id: { notIn: keptIds } },
      });

      // spec values for the category's spec fields
      const specFields = await tx.categorySpecField.findMany({
        where: { categoryId: p.categoryId },
      });
      for (const sf of specFields) {
        const value = (specValues[sf.id] ?? "").trim();
        await tx.productSpecValue.upsert({
          where: { productId_specFieldId: { productId: p.id, specFieldId: sf.id } },
          update: { value },
          create: { productId: p.id, specFieldId: sf.id, value },
        });
      }
      return p.id;
    });

    await recordAudit({
      adminUserId: admin.id,
      action: id ? "PRODUCT_UPDATED" : "PRODUCT_CREATED",
      entityType: "PRODUCT",
      entityId: productId,
      meta: { slug, name, ip, ua },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطای ناشناخته";
    if (msg.includes("VARIANT_OWNERSHIP")) return { error: "شناسه تنوع متعلق به این محصول نیست" };
    if (msg.includes("STOCK_RESERVED")) return { error: "موجودی نمی‌تواند کمتر از مقدار رزروشده باشد" };
    if (msg.includes("STOCK_CHANGED")) return { error: "موجودی محصول هم‌زمان تغییر کرده؛ صفحه را تازه‌سازی کنید" };
    if (msg.includes("slug") && msg.includes("Unique")) return { error: "این اسلاگ قبلاً استفاده شده است" };
    if (msg.includes("sku") && msg.includes("Unique")) return { error: "یکی از SKUها تکراری است" };
    if (msg.includes("Foreign key")) return { error: "دسته‌بندی یا دادهٔ مرتبط معتبر نیست" };
    return { error: "ذخیره انجام نشد؛ دوباره تلاش کنید" };
  }

  // redirect AFTER the try/catch — NEXT_REDIRECT must not be swallowed
  redirect(`/products/${productId}`);
}

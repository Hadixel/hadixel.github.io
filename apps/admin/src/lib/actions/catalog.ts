"use server";

import { redirect } from "next/navigation";
import { db, $Enums } from "@kmodern/db";
import { seoSchema } from "@kmodern/schema";
import { actionContext } from "./ctx";
import { field, intField, jsonParse } from "./form-helpers";
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
  if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)) return { error: "وضعیت نامعتبر است" };

  const features = field(formData, "features")
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  const extraSpecs = jsonParse<Record<string, string>>(formData.get("extraSpecs") as string | null, {});
  const variants = jsonParse<VariantInput[]>(formData.get("variants") as string | null, []);
  const specValues = jsonParse<Record<string, string>>(formData.get("specValues") as string | null, {});

  const seoRaw = jsonParse<Record<string, unknown>>(formData.get("seo") as string | null, {});
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

  try {
    const product = await db().$transaction(async (tx) => {
      const p = id
        ? await tx.product.update({ where: { id }, data: productData })
        : await tx.product.create({ data: productData });

      // variants: update kept in place, create new, delete dropped
      const keptIds: string[] = [];
      for (const v of variants) {
        const data = {
          colorName: v.colorName,
          colorCode: v.colorCode || null,
          sku: v.sku,
          price: Number(v.price),
          stock: Number(v.stock),
          allowBackorder: v.allowBackorder,
          images: v.images.filter(Boolean),
        };
        if (v.id && (await tx.variant.findUnique({ where: { id: v.id } }))) {
          await tx.variant.update({ where: { id: v.id }, data });
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
      return p;
    });

    await recordAudit({
      adminUserId: admin.id,
      action: id ? "PRODUCT_UPDATED" : "PRODUCT_CREATED",
      entityType: "PRODUCT",
      entityId: product.id,
      meta: { slug, name, ip, ua },
    });
    redirect(`/products/${product.id}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطای ناشناخته";
    if (msg.includes("slug") && msg.includes("Unique")) return { error: "این اسلاگ قبلاً استفاده شده است" };
    if (msg.includes("sku") && msg.includes("Unique")) return { error: "یکی از SKUها تکراری است" };
    if (msg.includes("Foreign key")) return { error: "دسته‌بندی یا دادهٔ مرتبط معتبر نیست" };
    return { error: `ذخیره نشد: ${msg}` };
  }
}

export async function saveCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, ip, ua } = await actionContext();
  const id = field(formData, "id");
  const name = field(formData, "name");
  const slug = field(formData, "slug");
  const parentId = field(formData, "parentId") || null;
  const weightKg = Number(formData.get("weightKg"));
  const sortOrder = intField(formData, "sortOrder");

  if (!name || !slug) return { error: "نام و اسلاگ الزامی است" };
  if (!Number.isFinite(weightKg) || weightKg <= 0) return { error: "وزن (کیلوگرم) باید عددی بزرگ‌تر از صفر باشد" };

  // 2-level rule: parent must be a top-level category; children can't nest deeper
  if (parentId) {
    const parent = await db().category.findUnique({ where: { id: parentId } });
    if (!parent) return { error: "دستهٔ والد پیدا نشد" };
    if (parent.parentId) return { error: "ساختار فقط دو سطحی است؛ والد باید ریشه باشد" };
    if (id && parent.id === id) return { error: "دسته نمی‌تواند والد خودش باشد" };
  }

  const specFields = jsonParse<
    Array<{ id?: string; name: string; type: string; unit?: string; filterable: boolean; sortOrder: number }>
  >(formData.get("specFields") as string | null, []);

  try {
    await db().$transaction(async (tx) => {
      const cat = id
        ? await tx.category.update({ where: { id }, data: { name, slug, parentId, weightKg, sortOrder } })
        : await tx.category.create({ data: { name, slug, parentId, weightKg, sortOrder } });

      const kept: string[] = [];
      for (const f of specFields) {
        if (!f.name.trim()) continue;
        const data = {
          name: f.name.trim(),
          type: f.type || "string",
          unit: f.unit || null,
          filterable: f.filterable,
          sortOrder: Number(f.sortOrder) || 0,
        };
        if (f.id) {
          await tx.categorySpecField.update({ where: { id: f.id }, data });
          kept.push(f.id);
        } else {
          const created = await tx.categorySpecField.create({ data: { categoryId: cat.id, ...data } });
          kept.push(created.id);
        }
      }
      await tx.categorySpecField.deleteMany({ where: { categoryId: cat.id, id: { notIn: kept } } });
    });
    await recordAudit({
      adminUserId: admin.id,
      action: id ? "CATEGORY_UPDATED" : "CATEGORY_CREATED",
      entityType: "CATEGORY",
      entityId: id,
      meta: { name, slug, ip, ua },
    });
    return { ok: true, message: "دسته‌بندی ذخیره شد" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطای ناشناخته";
    if (msg.includes("slug") && msg.includes("Unique")) return { error: "این اسلاگ قبلاً استفاده شده است" };
    return { error: `ذخیره نشد: ${msg}` };
  }
}

export async function deleteCategory(formData: FormData) {
  const { admin, ip, ua } = await actionContext();
  const id = field(formData, "id");
  const cat = await db().category.findUnique({
    where: { id },
    include: { _count: { select: { children: true, products: true } } },
  });
  if (!cat) return { error: "دسته پیدا نشد" };
  if (cat._count.children > 0 || cat._count.products > 0) {
    return { error: "دسته دارای زیردسته یا محصول است و حذف نمی‌شود" };
  }
  await db().category.delete({ where: { id } });
  await recordAudit({
    adminUserId: admin.id,
    action: "CATEGORY_DELETED",
    entityType: "CATEGORY",
    entityId: id,
    meta: { ip, ua },
  });
  return { ok: true };
}

export async function saveCollection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, ip, ua } = await actionContext();
  const id = field(formData, "id");
  const name = field(formData, "name");
  const slug = field(formData, "slug");
  const sortOrder = intField(formData, "sortOrder");
  const items = jsonParse<Array<{ productId: string; sortOrder: number }>>(
    formData.get("items") as string | null,
    [],
  );

  if (!name || !slug) return { error: "نام و اسلاگ الزامی است" };

  try {
    await db().$transaction(async (tx) => {
      const collection = id
        ? await tx.collection.update({ where: { id }, data: { name, slug, sortOrder } })
        : await tx.collection.create({ data: { name, slug, sortOrder } });

      await tx.collectionItem.deleteMany({ where: { collectionId: collection.id } });
      if (items.length) {
        await tx.collectionItem.createMany({
          data: items.map((it, idx) => ({
            collectionId: collection.id,
            productId: it.productId,
            sortOrder: Number(it.sortOrder) || idx,
          })),
        });
      }
      return collection;
    });
    await recordAudit({
      adminUserId: admin.id,
      action: id ? "COLLECTION_UPDATED" : "COLLECTION_CREATED",
      entityType: "COLLECTION",
      entityId: id,
      meta: { name, slug, ip, ua },
    });
    return { ok: true, message: "مجموعه ذخیره شد" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطای ناشناخته";
    if (msg.includes("slug") && msg.includes("Unique")) return { error: "این اسلاگ قبلاً استفاده شده است" };
    return { error: `ذخیره نشد: ${msg}` };
  }
}

export async function deleteCollection(formData: FormData) {
  const { admin, ip, ua } = await actionContext();
  const id = field(formData, "id");
  await db().collectionItem.deleteMany({ where: { collectionId: id } });
  await db().collection.delete({ where: { id } });
  await recordAudit({
    adminUserId: admin.id,
    action: "COLLECTION_DELETED",
    entityType: "COLLECTION",
    entityId: id,
    meta: { ip, ua },
  });
  return { ok: true };
}

/** useActionState-compatible wrappers (deletes return ActionState) */
export async function deleteCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return deleteCategory(formData);
}

export async function deleteCollectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return deleteCollection(formData);
}

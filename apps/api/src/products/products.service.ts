// What a product may be, and how its variants are reconciled.
//
// Everything here is a rule the panel used to hold in `saveProduct`, and each one needed to read a
// *second* thing — the stored row, the category's declared spec fields, another variant's SKU — which
// is exactly why none of them can be a decorator and all of them belong here.
//
// The variant diff is the interesting part, because the panel's version contained a guard that could
// never fire. It re-read the variant inside the transaction and then wrote conditionally on
// `stock: existing.stock, reserved: existing.reserved` — the values it had just read, on the same
// connection, inside the same transaction. That condition is true by construction. The comment above
// it claimed "a stale product form cannot overwrite a concurrent order", and the code could not do
// that: a form showing a stale stock overwrote a hold taken since, silently.
//
// The floor was real, though, and it is now `setVariantStock` — the same function the manual stock
// adjustment uses, so the two writers of a variant's stock cannot drift apart. What this module adds
// is the reconciliation around it.

import type { Prisma } from "../generated/prisma/client.js";
import { productSlug, canonicalSlug } from "@kmodern/schema/slug";
import { seoSchema } from "@kmodern/schema";
import { setVariantStock } from "../inventory/inventory.service.js";
import {
  ProductCategoryException,
  ProductRuleException,
  ProductSkuTakenException,
  ProductSlugTakenException,
  VariantOwnershipException,
} from "./exceptions/product.exception.js";
import type { SaveProductDto, VariantInputDto } from "./dto/product.dto.js";


/**
 * The address a product is published at.
 *
 * Derived from brand, model and name when the form did not supply one, and canonicalised when it did.
 * `productSlug` rather than `canonicalSlug` alone, because brand and model are what identify a product
 * to a shopper, and a slug built from the name alone collides exactly when the shop is large enough
 * for that to happen — two handsets of the same model.
 *
 * The panel had no slug function at all, so a product's address was whatever the operator typed, and
 * `"موبایل"` and `"mobile"` were two products.
 */
export function slugFor(body: SaveProductDto): string {
  const supplied = body.slug?.trim();
  if (supplied) return canonicalSlug(supplied);
  return productSlug(body.brand, body.model, body.name);
}

/**
 * Is this slug free?
 *
 * Asked rather than caught, for the reason the category's equivalent is asked: the panel matched the
 * text of a Prisma error (`msg.includes("slug") && msg.includes("Unique")`), which is a rule about a
 * driver's wording and reports a collision and an unrelated failure with the same sentence.
 *
 * `exceptId` is the product being edited, so re-saving a product without touching its slug is not a
 * collision with itself — a real case, because the panel's form always sends the whole product.
 *
 * Asked *inside* the transaction so the answer and the write cannot disagree. It is not a substitute
 * for the unique index: two operators saving the same slug at the same moment can both read "free", so
 * the index is still what enforces it and the driver error still has to be translated if it escapes.
 */
export async function assertSlugFree(
  tx: Prisma.TransactionClient,
  slug: string,
  exceptId: string | null,
): Promise<void> {
  const existing = await tx.product.findFirst({ where: { slug } });
  if (existing && existing.id !== exceptId) throw new ProductSlugTakenException(slug);
}

/**
 * The product's own rules, applied to a create and an update alike.
 *
 * A product with no variant is refused rather than stored: it is unsellable and the storefront's
 * product page has nothing to render for it. The panel accepted one, which left a row that looked live
 * in the panel's own list and could not be bought.
 */
export function assertProductIsSane(body: SaveProductDto): void {
  if (body.variants.length === 0) {
    throw new ProductRuleException("حداقل یک تنوع برای محصول لازم است");
  }

  const ids = body.variants
    .map((variant) => variant.id)
    .filter((id): id is string => id !== undefined);
  if (new Set(ids).size !== ids.length) {
    throw new ProductRuleException("شناسه تنوع تکراری است");
  }

  for (const variant of body.variants) {
    if (variant.colorName.trim() === "") {
      throw new ProductRuleException("نام رنگ هر تنوع الزامی است");
    }
  }
}

/**
 * The category exists.
 *
 * Asked rather than left to the foreign key: the panel's catch mapped "Foreign key" to a generic
 * "دسته‌بندی یا دادهٔ مرتبط معتبر نیست" after the whole transaction had already failed, so the operator
 * learned nothing about which of their several references was wrong.
 */
export async function assertCategoryExists(tx: Prisma.TransactionClient, categoryId: string): Promise<void> {
  const category = await tx.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new ProductCategoryException();
}

/**
 * Reconcile the product's variants with the set the form sent, and answer the ids that survive.
 *
 * Three steps, in this order, and the order is the rule:
 *
 *   1. Ownership — every id in the form must belong to *this* product — is checked before any write,
 *      so a stale form is refused before it has re-pointed a variant at a product it does not belong
 *      to. The panel checked it per row inside its own loop, which reached the same place only
 *      because the whole loop was in a transaction, a property of the code rather than of a signature.
 *   2. SKU freedom, for the new rows only. An unchanged SKU is not a collision with itself, and the
 *      form sends every variant every time, so every save of an unchanged product would otherwise
 *      collide with itself.
 *   3. The stock change, through `setVariantStock`, so the reserved floor and the compare-and-set are
 *      the ones a manual adjustment is held to.
 *
 * Kept variants are updated in place, never deleted and re-created: a variant's id is what an order
 * line points at, so re-creating one orphans every order that named it.
 *
 * The caller deletes what is missing, using the returned list — the deletion is outside this function
 * only so that the list it needs is the list this function built.
 */
export async function reconcileVariants(
  tx: Prisma.TransactionClient,
  productId: string,
  variants: VariantInputDto[],
): Promise<string[]> {
  const keptIds: string[] = [];

  for (const variant of variants) {
    if (variant.id !== undefined) {
      const existing = await tx.variant.findFirst({ where: { id: variant.id, productId } });
      if (!existing) throw new VariantOwnershipException();

      await tx.variant.update({
        where: { id: variant.id },
        data: {
          colorName: variant.colorName,
          colorCode: variant.colorCode?.trim() || null,
          sku: variant.sku,
          price: variant.price,
          allowBackorder: variant.allowBackorder,
          images: variant.images.filter((image) => image.trim() !== ""),
        },
      });

      // Only when it actually changed, because `setVariantStock` is a compare-and-set: writing the
      // same number back would still claim the row, and a no-op write that can conflict is a no-op
      // that can fail.
      if (variant.stock !== existing.stock) {
        await setVariantStock(tx, variant.id, variant.stock, {
          stock: existing.stock,
          reserved: existing.reserved,
        });
      }

      keptIds.push(variant.id);
      continue;
    }

    const clash = await tx.variant.findFirst({ where: { sku: variant.sku } });
    if (clash) throw new ProductSkuTakenException(variant.sku);

    const created = await tx.variant.create({
      data: {
        productId,
        colorName: variant.colorName,
        colorCode: variant.colorCode?.trim() || null,
        sku: variant.sku,
        price: variant.price,
        stock: variant.stock,
        allowBackorder: variant.allowBackorder,
        images: variant.images.filter((image) => image.trim() !== ""),
      },
    });
    keptIds.push(created.id);
  }

  return keptIds;
}

/**
 * Write the category's specification values, and only those.
 *
 * A value the form sent for a spec field of a *different* category is refused rather than written. The
 * panel looped the category's own fields and wrote those, which meant a value for another category's
 * field was silently dropped — the operator saw it in the form and it never appeared anywhere.
 */
export async function writeSpecValues(
  tx: Prisma.TransactionClient,
  productId: string,
  categoryId: string,
  specValues: Record<string, string>,
  upsertSpecValue: (productId: string, specFieldId: string, value: string) => Promise<unknown>,
): Promise<void> {
  const fields = await tx.categorySpecField.findMany({ where: { categoryId } });
  const known = new Set(fields.map((field) => field.id));

  for (const [specFieldId, raw] of Object.entries(specValues)) {
    if (!known.has(specFieldId)) {
      throw new ProductRuleException("یکی از فیلدهای مشخصات متعلق به این دسته نیست");
    }
    await upsertSpecValue(productId, specFieldId, raw.trim());
  }
}

/**
 * The SEO block, or nothing.
 *
 * `seoSchema` is the shared contract and is run here rather than re-declared as a DTO: a
 * class-validator copy of a zod schema would be the second definition of the SEO rules, which is the
 * defect this whole move exists to end. An absent block is `null`; a *present and wrong* one is
 * refused, because silently dropping it would leave the product with no SEO at all and no message.
 */
export function parseSeo(raw: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (raw === undefined) return null;
  if (Object.keys(raw).length === 0) return null;

  const parsed = seoSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProductRuleException(`فرم SEO نامعتبر است: ${parsed.error.issues[0]?.message ?? ""}`);
  }
  return parsed.data as Record<string, unknown>;
}

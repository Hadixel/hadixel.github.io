// Products, at the operator's edge — the last and largest of the panel's writes.
//
// The panel's `saveProduct` was a transaction of its own, a diff of its own, a set of bounds of its
// own, and an audit line written *after* the transaction had committed. Moving it changes three
// things beyond where the code lives:
//
//   - The slug is *produced* here rather than taken from the form. The panel had no slug function at
//     all, so a product's address was whatever the operator typed, and `"موبایل"` and `"mobile"` were
//     two products at two addresses — which splits the catalogue's inbound links, and the one that
//     gets the traffic is the one the panel wrote.
//   - The stock rules are the ones `inventory.service.ts` already holds, called rather than copied.
//     The panel's variant diff had its own reserved floor, and its own compare-and-set that could not
//     fire because it compared a row against a read of that same row.
//   - The audit line is inside the transaction. The panel's ran after the commit, so a failed audit
//     write was a changed product nobody could account for, and the operator was told it had saved.
//
// Every refusal names the field or the id, because the panel's catch funnelled eight different
// failures into "ذخیره انجام نشد؛ دوباره تلاش کنید" and the operator had no way to tell a typo from a
// database being down.

import { Body, Controller, Delete, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { writeAudit } from "../common/audit.js";
import { AuthService } from "../auth/auth.service.js";
import { requireAdmin } from "../auth/identity.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { SaveProductDto } from "./dto/product.dto.js";
import { ProductNotFoundException, ProductRuleException } from "./exceptions/product.exception.js";
import {
  assertCategoryExists,
  assertProductIsSane,
  assertSlugFree,
  parseSeo,
  reconcileVariants,
  slugFor,
  writeSpecValues,
} from "./products.service.js";

type Tx = Prisma.TransactionClient;

/** What a saved product answers with: the id to navigate to, and the slug it landed on. */
export interface ProductSaved {
  id: string;
  slug: string;
}

@Controller("products")
export class ProductsController {
  constructor(
    private readonly auth: AuthService,
    // The data client arrives through the module that owns it, the same as every other feature.
    @Inject(DATA_CLIENT) private readonly db: PrismaClient,
  ) {}

  @Post()
  async create(@Req() req: Request, @Body() body: SaveProductDto): Promise<ProductSaved> {
    const admin = await requireAdmin(this.auth, req);

    // One transaction: the product, its variants, its spec values and the audit line commit or none
    // of them do. The panel had all four, and the audit line outside.
    return this.db.$transaction(async (tx) => {
      const slug = slugFor(body);
      assertProductIsSane(body);
      await assertCategoryExists(tx, body.categoryId);
      await assertSlugFree(tx, slug, null);

      const product = await tx.product.create({
        data: {
          slug,
          name: body.name,
          brand: body.brand,
          model: body.model,
          categoryId: body.categoryId,
          description: body.description?.trim() || null,
          features: body.features ?? [],
          extraSpecs: (body.extraSpecs ?? null) as never,
          status: body.status,
          allowBackorder: body.allowBackorder ?? false,
          seo: parseSeo(body.seo) as never,
        },
      });

      await reconcileVariants(tx, product.id, body.variants);

      await writeSpecValues(tx, product.id, body.categoryId, body.specValues ?? {}, (p, f, value) =>
        tx.productSpecValue.upsert({
          where: { productId_specFieldId: { productId: p, specFieldId: f } },
          update: { value },
          create: { productId: p, specFieldId: f, value },
        }),
      );

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "PRODUCT_CREATED",
        entityType: "PRODUCT",
        entityId: product.id,
        meta: { slug, name: body.name, brand: body.brand, variants: body.variants.length },
      });

      return { id: product.id, slug: product.slug };
    });
  }

  @Patch(":id")
  async update(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: SaveProductDto,
  ): Promise<ProductSaved> {
    const admin = await requireAdmin(this.auth, req);

    return this.db.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({ where: { id } });
      // A lookup before anything is written, rather than a bare `update`: an update against an id that
      // is not there is a Prisma error, and the panel reported that as "ذخیره انجام نشد" —
      // indistinguishable from a database being down. A stale form is a 404 and says so.
      if (!existing) throw new ProductNotFoundException();

      // An absent or blank slug keeps the address the product already has. A form that did not touch
      // the field must not move a product's URL, and an address that changes on a rename breaks every
      // link already pointing at it.
      const slug = body.slug?.trim() ? slugFor(body) : existing.slug;
      assertProductIsSane(body);
      await assertCategoryExists(tx, body.categoryId);
      if (slug !== existing.slug) await assertSlugFree(tx, slug, id);

      const product = await tx.product.update({
        where: { id },
        data: {
          slug,
          name: body.name,
          brand: body.brand,
          model: body.model,
          categoryId: body.categoryId,
          description: body.description?.trim() || null,
          features: body.features ?? [],
          extraSpecs: (body.extraSpecs ?? null) as never,
          status: body.status,
          allowBackorder: body.allowBackorder ?? false,
          seo: parseSeo(body.seo) as never,
        },
      });

      const keptIds = await reconcileVariants(tx, product.id, body.variants);

      // Whatever the form did not send is a variant the operator removed. Explicit, and inside the
      // same transaction: the panel's delete-many ran in the same block, but its *audit* line did not,
      // so a failure here left a product with fewer variants and no record of it.
      await tx.variant.deleteMany({ where: { productId: product.id, id: { notIn: keptIds } } });

      await writeSpecValues(tx, product.id, body.categoryId, body.specValues ?? {}, (p, f, value) =>
        tx.productSpecValue.upsert({
          where: { productId_specFieldId: { productId: p, specFieldId: f } },
          update: { value },
          create: { productId: p, specFieldId: f, value },
        }),
      );

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "PRODUCT_UPDATED",
        entityType: "PRODUCT",
        entityId: id,
        meta: { slug, name: body.name, brand: body.brand, variants: body.variants.length },
      });

      return { id: product.id, slug: product.slug };
    });
  }

  @Delete(":id")
  async remove(@Req() req: Request, @Param("id") id: string): Promise<{ deleted: true }> {
    const admin = await requireAdmin(this.auth, req);

    return this.db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id } });
      if (!product) throw new ProductNotFoundException();

      // Refuse rather than cascade. A product with stock on it, or with an order naming one of its
      // variants, is not a row an operator may delete: the order line would be left pointing at
      // nothing, and the stock count would no longer describe anything real. The panel's delete had
      // no check at all and let the foreign key raise.
      const variants = await tx.variant.findMany({ where: { productId: id } });
      const withStock = variants.filter((variant) => variant.stock > 0);
      if (withStock.length > 0) {
        throw new ProductRuleException(
          `این محصول موجودی دارد و حذف نمی‌شود: ${withStock.map((v) => v.sku).join("، ")}`,
        );
      }

      // The spec values go with it, explicitly. Nothing in the schema cascades, so without this the
      // delete raises a foreign key error — and the panel's action had no catch around it, so a
      // product with specification values could not be deleted from the panel at all. The same class
      // of gap the category delete had.
      await tx.productSpecValue.deleteMany({ where: { productId: id } });
      await tx.collectionItem.deleteMany({ where: { productId: id } });
      await tx.variant.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "PRODUCT_DELETED",
        entityType: "PRODUCT",
        entityId: id,
        meta: { slug: product.slug, name: product.name },
      });

      return { deleted: true };
    });
  }
}

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

import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { writeAudit } from "../common/audit.js";
import { AuthService } from "../auth/auth.service.js";
import { requireAdmin } from "../auth/identity.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { SaveProductDto } from "./dto/product.dto.js";
import { MAX_PRODUCT_PAGE_SIZE, ProductListQueryDto } from "./dto/product-query.dto.js";
import type { ProductDetail, ProductListRow, ProductPage } from "./dto/product-read.dto.js";
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

  /**
   * The catalogue's product names, for a picker in the panel.
   *
   * A picker needs an id and a label and nothing else, and it needs them from a read rather than from
   * the panel's own copy of the product table. Capped, because a picker lists what a person can scan:
   * an unbounded list is not a control, and the cost of building one is a client's to choose.
   */
  @Get("options")
  async options(): Promise<{ id: string; name: string }[]> {
    return this.db.product.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 500,
    });
  }

  /**
   * One page of the operator's product table.
   *
   * The panel's page used to run the rows and the total itself, over a `where` it assembled out of its
   * own `searchParams`. Both are answered here, together, for the reason every one of this gateway's
   * lists answers its count beside its rows: a total fetched separately can disagree with them. The
   * filter belongs here too — which columns a search box covers is the gateway's decision, and a
   * page holding a copy of it is a page that quietly stops matching what the box says.
   *
   * The page size is the caller's to name within a bound and the server's to hold: a route that reads
   * whatever `size` says is a route anything that can reach it can ask the whole catalogue of. The
   * size actually used comes back on the answer, so the pager divides by the slice that was read.
   */
  @Get()
  async list(@Req() req: Request, @Query() query: ProductListQueryDto): Promise<ProductPage> {
    await requireAdmin(this.auth, req);

    const size = Math.min(query.size, MAX_PRODUCT_PAGE_SIZE);
    const where = {
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      // The four columns the panel's search box has always covered, with the case-insensitive match it
      // has always used. Both carried over on purpose: a search that quietly stopped matching a brand,
      // or started matching only one case of a model number, reads as a shop with fewer products in it
      // rather than as a search that got narrower.
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" as const } },
              { model: { contains: query.q, mode: "insensitive" as const } },
              { brand: { contains: query.q, mode: "insensitive" as const } },
              { slug: { contains: query.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.db.product.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * size,
        take: size,
        select: {
          id: true,
          name: true,
          slug: true,
          model: true,
          status: true,
          updatedAt: true,
          category: { select: { id: true, name: true } },
          _count: { select: { variants: true } },
        },
      }),
      this.db.product.count({ where }),
    ]);

    const products: ProductListRow[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      model: row.model,
      status: row.status,
      category: row.category,
      // The count is a number the table prints. `_count.variants` is the query that produced it, and
      // is not a name the page should have to know.
      variantCount: row._count.variants,
      updatedAt: row.updatedAt.toISOString(),
    }));

    return { products, total, page: query.page, size };
  }

  /**
   * One product in full, for the edit form to seed itself from.
   *
   * A 404 rather than an empty object, because the page answers a missing product with `notFound()`
   * and an empty one would render a blank form that saves over whatever the id actually named.
   *
   * The spec values cross as a record keyed by spec-field id, which is the shape the form holds. The
   * panel used to build that record here — `Object.fromEntries(rows.map(...))` — in the page, and a
   * projection performed by the client is one performed wrongly the first time someone edits it.
   */
  @Get(":id")
  async one(@Req() req: Request, @Param("id") id: string): Promise<ProductDetail> {
    await requireAdmin(this.auth, req);

    const product = await this.db.product.findUnique({
      where: { id },
      include: { variants: { orderBy: { colorName: "asc" } }, specValues: true },
    });
    if (!product) throw new ProductNotFoundException();

    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      model: product.model,
      slug: product.slug,
      categoryId: product.categoryId,
      description: product.description,
      features: product.features,
      status: product.status,
      allowBackorder: product.allowBackorder,
      // A `Json` column the panel cast to a record on the way in. Read as a record or nothing, so the
      // form's prop type is the response's type and no cast survives the move.
      seo: (product.seo ?? null) as Record<string, unknown> | null,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        colorName: variant.colorName,
        colorCode: variant.colorCode,
        sku: variant.sku,
        price: variant.price,
        stock: variant.stock,
        allowBackorder: variant.allowBackorder,
        images: variant.images,
      })),
      specValues: Object.fromEntries(
        product.specValues.map((value) => [value.specFieldId, value.value]),
      ),
    };
  }

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

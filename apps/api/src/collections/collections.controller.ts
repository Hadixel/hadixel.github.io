// Collections, at the operator's edge — a named, ordered set of products.
//
// The panel's version of a delete is why this route exists in the shape it does. `deleteCollection`
// deleted the membership rows, then the collection, then wrote the audit line: three statements with
// nothing binding them. A failure between the first two left a collection that still existed with its
// products silently emptied, which is a state no operator would believe and no screen reports. Here
// the membership, the row and the audit line are one transaction, so there is no such state to reach.
//
// The membership is *replaced* rather than patched, and the two are genuinely different requests: an
// empty list means "no products" and an absent field means "leave them alone". The panel's form could
// not tell those apart, because both arrived as the same JavaScript `undefined` once the form was
// serialised — so an update that omitted the field would have emptied the collection.
//
// The products are checked for existence inside the transaction, not before it. The panel counted
// them in a separate read and returned early, which is the right answer for a bad id and the wrong
// place to have learned it: between the count and the write, a product could be deleted and the
// membership would then point at nothing.

import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { canonicalSlug } from "@kmodern/schema/slug";
import { writeAudit } from "../common/audit.js";
import { AuthService } from "../auth/auth.service.js";
import { requireAdmin } from "../auth/identity.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { createPrismaClient } from "../prisma/client.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  SaveCollectionDto,
  UpdateCollectionDto,
  type CollectionItemInputDto,
} from "./dto/collection.dto.js";
import {
  CollectionNotFoundException,
  CollectionProductMissingException,
  CollectionSlugTakenException,
} from "./exceptions/collection.exception.js";

type Tx = Prisma.TransactionClient;

/** One collection as the panel's editor needs it. */
export interface CollectionSummary {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  items: { productId: string; productName: string; sortOrder: number }[];
}

/** What a saved collection answers with. */
export interface CollectionSaved {
  id: string;
  slug: string;
}

@Controller("collections")
export class CollectionsController {
  constructor(
    private readonly auth: AuthService,
    @Inject(DATA_CLIENT) private readonly db: ReturnType<typeof createPrismaClient>,
  ) {}

  /**
   * The collections, with the products in each, as the panel's editor needs them.
   *
   * Read rather than left to the panel, and the reason is the same as the settings definitions: the
   * editor has to be told what exists, and a panel holding its own read of the same tables is a second
   * shape for the same data, free to disagree about what a collection contains.
   *
   * `name` and `slug` of the member product travel with each item because the editor shows them next
   * to the ids it holds — one read rather than the panel fetching each product to label a row.
   */
  @Get()
  async list(): Promise<CollectionSummary[]> {
    const rows = await this.db.collection.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          include: { product: { select: { name: true, slug: true } } },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      sortOrder: row.sortOrder,
      items: row.items.map((item) => ({
        productId: item.productId,
        productName: item.product.name,
        sortOrder: item.sortOrder,
      })),
    }));
  }

  @Post()
  async create(@Req() req: Request, @Body() body: SaveCollectionDto): Promise<CollectionSaved> {
    const admin = await requireAdmin(this.auth, req);

    return this.db.$transaction(async (tx) => {
      const slug = canonicalSlug(body.slug?.trim() || body.name);
      await this.assertSlugFree(tx, slug);
      if (body.items) await this.assertProductsExist(tx, body.items);

      const collection = await tx.collection.create({
        data: { name: body.name, slug, sortOrder: body.sortOrder ?? 0 },
      });

      if (body.items && body.items.length > 0) {
        await tx.collectionItem.createMany({
          data: body.items.map((item, index) => ({
            collectionId: collection.id,
            productId: item.productId,
            // A form that leaves the position blank means "in the order I sent them", which is what
            // the panel did by falling back to the array index. Said here rather than in the DTO
            // because the DTO cannot know the index.
            sortOrder: item.sortOrder ?? index,
          })),
        });
      }

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "COLLECTION_CREATED",
        entityType: "COLLECTION",
        entityId: collection.id,
        meta: { name: body.name, slug, items: body.items?.length ?? 0 },
      });

      return { id: collection.id, slug: collection.slug };
    });
  }

  @Patch(":id")
  async update(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: UpdateCollectionDto,
  ): Promise<CollectionSaved> {
    const admin = await requireAdmin(this.auth, req);

    return this.db.$transaction(async (tx) => {
      const existing = await tx.collection.findUnique({ where: { id } });
      if (!existing) throw new CollectionNotFoundException();

      // An absent slug keeps the address, for the same reason a category's does: a rename that moves
      // the URL breaks every link already pointing at it.
      const slug =
        body.slug === undefined
          ? existing.slug
          : canonicalSlug(body.slug.trim() || body.name || existing.name);

      if (slug !== existing.slug) await this.assertSlugFree(tx, slug);
      if (body.items) await this.assertProductsExist(tx, body.items);

      const collection = await tx.collection.update({
        where: { id },
        data: {
          slug,
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(body.sortOrder === undefined ? {} : { sortOrder: body.sortOrder }),
        },
      });

      if (body.items) {
        // Delete and re-insert rather than diffing. The membership is a set keyed by product id with
        // no identity of its own, so there is nothing to update in place — and a `deleteMany` followed
        // by a `createMany` inside the transaction is one round trip each, where a diff would be one
        // round trip per product.
        await tx.collectionItem.deleteMany({ where: { collectionId: id } });
        if (body.items.length > 0) {
          await tx.collectionItem.createMany({
            data: body.items.map((item, index) => ({
              collectionId: id,
              productId: item.productId,
              sortOrder: item.sortOrder ?? index,
            })),
          });
        }
      }

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "COLLECTION_UPDATED",
        entityType: "COLLECTION",
        entityId: id,
        meta: { name: collection.name, slug, items: body.items?.length },
      });

      return { id: collection.id, slug: collection.slug };
    });
  }

  @Delete(":id")
  async remove(@Req() req: Request, @Param("id") id: string): Promise<{ deleted: true }> {
    const admin = await requireAdmin(this.auth, req);

    return this.db.$transaction(async (tx) => {
      const collection = await tx.collection.findUnique({ where: { id } });
      // The panel had no existence check here, so a stale form raised a raw Prisma error instead of
      // a sentence an operator could read.
      if (!collection) throw new CollectionNotFoundException();

      // Explicit, in this order, and in one transaction. Nothing in the schema cascades, so without
      // the first statement the second raises a foreign key error — and the panel's three separate
      // statements meant a failure between them left a collection that still existed with its
      // products silently removed from it.
      await tx.collectionItem.deleteMany({ where: { collectionId: id } });
      await tx.collection.delete({ where: { id } });

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "COLLECTION_DELETED",
        entityType: "COLLECTION",
        entityId: id,
        meta: { name: collection.name, slug: collection.slug },
      });

      return { deleted: true };
    });
  }

  private async assertSlugFree(tx: Tx, slug: string): Promise<void> {
    const taken = await tx.collection.findUnique({ where: { slug }, select: { id: true } });
    if (taken) throw new CollectionSlugTakenException(slug);
  }

  /**
   * Every product named by the form is in the catalogue.
   *
   * Asked inside the transaction, and the answer names the ids that were missing. A count is not
   * enough: "some of the products were not found" sends the operator through the form looking for a
   * row they cannot see, because the rows that are missing are exactly the ones the form still lists
   * and the database no longer has.
   */
  private async assertProductsExist(tx: Tx, items: CollectionItemInputDto[]): Promise<void> {
    const wanted = [...new Set(items.map((item) => item.productId))];
    if (wanted.length === 0) return;

    const found = await tx.product.findMany({ where: { id: { in: wanted } }, select: { id: true } });
    const foundIds = new Set(found.map((row) => row.id));
    const missing = wanted.filter((id) => !foundIds.has(id));
    if (missing.length > 0) throw new CollectionProductMissingException(missing);
  }
}

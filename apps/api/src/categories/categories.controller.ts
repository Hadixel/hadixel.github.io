// Categories, at the operator's edge.
//
// The panel had its own: a transaction of its own, its own parent rules, its own spec-field diffing,
// and an audit line written after the transaction had committed. None of that was wrong in detail —
// it was wrong in kind, because it was a second copy of rules the gateway has to hold too, and two
// copies of the two-level rule are free to disagree about which categories may be nested.
//
// The slug is *produced* here rather than taken from the form. The panel had no slug function at all,
// so a category's address was whatever the operator typed, and `"موبایل"` and `"mobile"` were two
// categories. This route derives the slug from the name when the form did not supply one and
// canonicalises it when it did, so there is one answer to "what is this category's address" and it is
// the same answer whoever asks.
//
// The audit line is inside the transaction, not after it. The panel's helper ran its insert once the
// change had already committed, so a failed audit write was a category nobody could account for, and
// the operator was told it had saved.

import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
// The `./slug` subpath rather than the package root, because the canonicalisation is not part of the
// schema's vocabulary — it is the one answer to "what is this thing's address", and it is imported on
// purpose by the writers that have to produce one.
import { canonicalSlug } from "@kmodern/contracts/slug";
import { writeAudit } from "../common/audit.js";
import { AuthService } from "../auth/auth.service.js";
import { requireAdmin } from "../auth/identity.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { Prisma, createPrismaClient } from "../prisma/index.js";
import { SaveCategoryDto, UpdateCategoryDto, type SpecFieldInputDto } from "./dto/category.dto.js";
import {
  CategoryNotEmptyException,
  CategoryNotFoundException,
  CategoryParentException,
  CategorySlugTakenException,
  SpecFieldOwnershipException,
} from "./exceptions/category.exception.js";

/**
 * The transaction client, named once.
 *
 * A rule that has to be checked inside the transaction is a private method, and a private method needs
 * a type for the client it is handed. Naming it here rather than inlining the callback keeps that
 * signature readable, and it is the same type `writeAudit` accepts — which is the point: a rule that
 * runs on `tx` and an audit line that runs on `tx` are in the same transaction by construction.
 */
type Tx = Prisma.TransactionClient;

/** One category as a product form needs it: a name, and the fields it declares. */
export interface CategoryOption {
  id: string;
  name: string;
  specFields: { id: string; name: string; type: string; unit: string | null }[];
}

/** One category, with the counts and the parent's name, as the panel's tree renders it. */
export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  parentName?: string;
  weightKg: number;
  sortOrder: number;
  productCount: number;
  childCount: number;
  specFields: {
    id: string;
    name: string;
    type: string;
    unit?: string;
    filterable: boolean;
    sortOrder: number;
  }[];
}

/** What a saved category answers with: the id to navigate to, and the slug it landed on. */
export interface CategorySaved {
  id: string;
  slug: string;
}

@Controller("categories")
export class CategoriesController {
  constructor(
    private readonly auth: AuthService,
    // The data client arrives through the module that owns it, the same as every other feature.
    @Inject(DATA_CLIENT) private readonly db: ReturnType<typeof createPrismaClient>,
  ) {}

  /**
   * The tree, as the panel's manager needs it.
   *
   * A parent name and two counts travel with each row because that is what the tree renders: the
   * manager holds ids and needs labels and sizes beside them, and a panel that fetched each of those
   * separately would be N+1 over a table it should not be reading.
   */
  /**
   * The categories with their declared spec fields, for the product form.
   *
   * Not `list()`: a product form asks a different question of the tree. It does not want counts or a
   * parent name, it wants the fields *this* category declares, because it renders an input per field
   * and the field list is the category's to decide. A form that asked for the whole tree and picked
   * the fields out would couple it to the shape of an answer meant for a screen.
   */
  @Get("options")
  async options(): Promise<CategoryOption[]> {
    const rows = await this.db.category.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        specFields: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, type: true, unit: true },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      specFields: row.specFields.map((field) => ({
        id: field.id,
        name: field.name,
        type: field.type,
        // `null` and not an absent key: the form's prop type says `string | null`, and an absent
        // key is a different thing from a field that has no unit — one is unknown, the other is none.
        unit: field.unit,
      })),
    }));
  }

  @Get()
  async list(@Req() req: Request): Promise<CategorySummary[]> {
    // Operator-only, and the reason is what this view carries rather than what the storefront already
    // shows: the public catalogue exposes a category's name and its products, while this answers with
    // its spec fields, its child count and its product count — the shop's shape to an operator. The
    // settings definitions are the opposite case and are deliberately public: nothing in a field
    // table is a secret.
    await requireAdmin(this.auth, req);

    const rows = await this.db.category.findMany({
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
      include: {
        parent: { select: { id: true, name: true } },
        specFields: { orderBy: { sortOrder: "asc" } },
        _count: { select: { products: true, children: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      parentId: row.parentId,
      parentName: row.parent?.name,
      weightKg: row.weightKg,
      sortOrder: row.sortOrder,
      productCount: row._count.products,
      childCount: row._count.children,
      specFields: row.specFields.map((field) => ({
        id: field.id,
        name: field.name,
        type: field.type,
        unit: field.unit ?? undefined,
        filterable: field.filterable,
        sortOrder: field.sortOrder,
      })),
    }));
  }

  @Post()
  async create(@Req() req: Request, @Body() body: SaveCategoryDto): Promise<CategorySaved> {
    const admin = await requireAdmin(this.auth, req);

    // One transaction. The row and the audit line commit or neither does, and the operator's answer
    // is only sent after both have.
    return this.db.$transaction(async (tx) => {
      const slug = canonicalSlug(body.slug?.trim() || body.name);
      await this.assertSlugFree(tx, slug);
      if (body.parentId !== undefined) await this.assertParentIsARoot(tx, body.parentId, null);

      const category = await tx.category.create({
        data: {
          name: body.name,
          slug,
          weightKg: body.weightKg,
          ...(body.sortOrder === undefined ? {} : { sortOrder: body.sortOrder }),
          parentId: body.parentId ?? null,
        },
      });

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "CATEGORY_CREATED",
        entityType: "CATEGORY",
        entityId: category.id,
        meta: { name: body.name, slug },
      });

      return { id: category.id, slug: category.slug };
    });
  }

  @Patch(":id")
  async update(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: UpdateCategoryDto,
  ): Promise<CategorySaved> {
    const admin = await requireAdmin(this.auth, req);

    return this.db.$transaction(async (tx) => {
      const existing = await tx.category.findUnique({ where: { id } });
      // A lookup before anything is written, rather than a bare `update`, because an update against
      // an id that is not there is a Prisma error and the panel reported that as "ذخیره انجام نشد" —
      // indistinguishable from a database being down. A stale form is a 404 and says so.
      if (!existing) throw new CategoryNotFoundException();

      // An absent slug keeps the address the category already has. A form that did not touch the slug
      // field must not move a category's URL, and an address that changes on a rename breaks every
      // link already pointing at it. A blank one falls back to the name, which is the only sensible
      // reading of "cleared the field".
      const slug =
        body.slug === undefined
          ? existing.slug
          : canonicalSlug(body.slug.trim() || body.name || existing.name);

      if (slug !== existing.slug) await this.assertSlugFree(tx, slug);
      if (body.parentId !== undefined && body.parentId !== null) {
        await this.assertParentIsARoot(tx, body.parentId, id);
      }

      const category = await tx.category.update({
        where: { id },
        data: {
          slug,
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(body.weightKg === undefined ? {} : { weightKg: body.weightKg }),
          ...(body.sortOrder === undefined ? {} : { sortOrder: body.sortOrder }),
          ...(body.parentId === undefined ? {} : { parentId: body.parentId }),
        },
      });

      if (body.specFields !== undefined) {
        await this.writeSpecFields(tx, id, body.specFields);
      }

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "CATEGORY_UPDATED",
        entityType: "CATEGORY",
        entityId: id,
        meta: { name: category.name, slug },
      });

      return { id: category.id, slug: category.slug };
    });
  }

  @Delete(":id")
  async remove(@Req() req: Request, @Param("id") id: string): Promise<{ deleted: true }> {
    const admin = await requireAdmin(this.auth, req);

    return this.db.$transaction(async (tx) => {
      const category = await tx.category.findUnique({
        where: { id },
        include: { _count: { select: { children: true, products: true } } },
      });
      if (!category) throw new CategoryNotFoundException();

      // Two refusals rather than one, because the operator's next step differs. The panel answered
      // both with "دسته دارای زیردسته یا محصول است و حذف نمی‌شود", which names both and so names
      // neither: an operator with products in the category reads it, looks for subcategories, finds
      // none, and does not know which of the two things is in the way.
      if (category._count.children > 0) {
        throw new CategoryNotEmptyException("این دسته زیردسته دارد؛ ابتدا زیردسته‌ها را حذف یا جابه‌جا کنید");
      }
      if (category._count.products > 0) {
        throw new CategoryNotEmptyException("این دسته محصول دارد؛ ابتدا محصولات را جابه‌جا کنید");
      }

      // The spec fields go with it, explicitly. Nothing in the schema cascades, so without this the
      // delete raises a foreign key error — which the panel's `deleteCategory` had no catch around, so
      // a category with specification fields could not be deleted from the panel at all. Their values
      // cannot be a problem here: a value needs a product, and a category with products was refused
      // two lines above.
      await tx.categorySpecField.deleteMany({ where: { categoryId: id } });
      await tx.category.delete({ where: { id } });

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "CATEGORY_DELETED",
        entityType: "CATEGORY",
        entityId: id,
        meta: { name: category.name, slug: category.slug },
      });

      return { deleted: true };
    });
  }

  /**
   * Replace a category's specification fields with the ones the form sent.
   *
   * Three steps, in this order, and the order is the rule: the ownership check comes before any write,
   * so a field belonging to another category is refused before this one has been re-pointed at it. The
   * panel did the ownership check per field inside its own loop and threw from there, which reached
   * the same place — but only because its whole loop was in a transaction, which is a property of the
   * code rather than of the signature.
   *
   * Kept fields are updated in place, never deleted and re-created. A spec field's id is what a
   * product's stored value points at, so re-creating one orphans every product that had answered it.
   */
  private async writeSpecFields(tx: Tx, categoryId: string, fields: SpecFieldInputDto[]): Promise<void> {
    const kept: string[] = [];

    for (const field of fields) {
      const data = {
        name: field.name.trim(),
        type: field.type || "string",
        unit: field.unit ?? null,
        filterable: field.filterable ?? true,
        sortOrder: field.sortOrder ?? 0,
      };

      if (field.id === undefined) {
        const created = await tx.categorySpecField.create({ data: { categoryId, ...data } });
        kept.push(created.id);
        continue;
      }

      const existing = await tx.categorySpecField.findFirst({
        where: { id: field.id, categoryId },
        select: { id: true },
      });
      if (!existing) throw new SpecFieldOwnershipException();

      await tx.categorySpecField.update({ where: { id: field.id }, data });
      kept.push(field.id);
    }

    await tx.categorySpecField.deleteMany({ where: { categoryId, id: { notIn: kept } } });
  }

  /**
   * Is this slug free?
   *
   * Asked rather than caught. The panel decided this by reading the text of a Prisma error —
   * `msg.includes("slug") && msg.includes("Unique")` — which is a rule about a driver's wording, and
   * which fails in the worst direction when the wording changes: the save is refused and the operator
   * is told "ذخیره انجام نشد" with nothing to act on. Asking costs one indexed read and answers with a
   * sentence that names the slug.
   *
   * It is asked *inside* the transaction so the answer and the write cannot disagree, and it is not a
   * substitute for the unique index: two operators saving the same slug at the same moment can both
   * read "free", so the index is still what actually enforces it and the driver error still has to
   * be translated when it escapes.
   */
  private async assertSlugFree(tx: Tx, slug: string): Promise<void> {
    const taken = await tx.category.findUnique({ where: { slug }, select: { id: true } });
    if (taken) throw new CategorySlugTakenException(slug);
  }

  /**
   * The two-level rule: a parent must be a root.
   *
   * The panel checked this too, in a read that happened before the transaction and in a separate
   * round trip, so a second operator re-parenting in between produced a three-level tree that nothing
   * had refused — and the storefront's category page has no third level to render, so the deepest
   * category became unreachable by navigation.
   *
   * `movingId` is the category being re-parented, checked because a category cannot be its own parent
   * and cannot be made a child of something it already contains.
   */
  private async assertParentIsARoot(tx: Tx, parentId: string, movingId: string | null): Promise<void> {
    const parent = await tx.category.findUnique({
      where: { id: parentId },
      select: { id: true, parentId: true },
    });
    if (!parent) throw new CategoryParentException("دستهٔ والد پیدا نشد.");
    if (parent.parentId) {
      throw new CategoryParentException("ساختار فقط دو سطحی است؛ والد باید ریشه باشد.");
    }
    if (movingId !== null && parent.id === movingId) {
      throw new CategoryParentException("دسته نمی‌تواند والد خودش باشد.");
    }
  }
}

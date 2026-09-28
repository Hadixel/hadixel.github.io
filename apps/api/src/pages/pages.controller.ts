// Pages, at the operator's edge — the page builder's writes.
//
// The panel had its own `validateBlocks`, and it is gone rather than kept as a fast-fail. A fast-fail
// a client owns is a rule a client may skip: the panel parsed every block against `blockSchema` and
// `componentSchemas` before writing, which read like a guarantee and were not one, because the panel
// is a client and the rule was in a package the storefront also imports. The vocabulary is now applied
// here, once, and a caller that skips it cannot store a page at all.
//
// The other two changes are the ones every migrated write has brought. The audit line moved inside the
// transaction, so a page that saved is a page somebody can account for and a page that did not is a
// page that left no trace. And the delete is one implementation rather than two: there used to be a
// bare `deletePage(formData)` and a `deletePageAction(_prev, formData)` that existed only to satisfy
// `useActionState` and returned whatever the first one did — two places for one rule to live, and one
// of them to be forgotten.

import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { componentSchemas } from "@kmodern/schema";
import { PageStatus } from "../generated/prisma/enums";
import { PageActionDto } from "./dto/page.dto.js";
import { writeAudit } from "../common/audit.js";
import { AuthService } from "../auth/auth.service.js";
import { requireAdmin } from "../auth/identity.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { SavePageDto } from "./dto/page.dto.js";
import { PageNotFoundException, PageSlugTakenException } from "./exceptions/page.exception.js";
import {
  assertPageIsDeletable,
  assertSlugIsMovable,
  parsePageSeo,
  validateBlocks,
} from "./pages.service.js";

type Tx = Prisma.TransactionClient;

@Controller("pages")
export class PagesController {
  constructor(
    private readonly auth: AuthService,
    // The data client arrives through the module that owns it, the same as every other feature.
    @Inject(DATA_CLIENT) private readonly db: PrismaClient,
  ) {}

  /**
   * Save a page, creating it or editing it.
   *
   * One route rather than two, because the panel's form sends the same fields either way and the only
   * difference is whether it carried an id — which the gateway can read from the path. A separate
   * `POST` and `PUT` would make the caller decide which it meant, and a stale id would then be a
   * create rather than an answer.
   */
  @Post()
  async create(@Req() req: Request, @Body() body: SavePageDto): Promise<{ id: string; slug: string }> {
    const admin = await requireAdmin(this.auth, req);

    return this.db.$transaction(async (tx) => {
      const blocks = validateBlocks(body.blocks);
      const seo = parsePageSeo(body.seo);
      await assertSlugFree(tx, body.slug, null);

      const published = body.action === PageActionDto.PUBLISH;
      const page = await tx.page.create({
        data: {
          slug: body.slug,
          kind: "CUSTOM",
          title: body.title,
          status: published ? PageStatus.PUBLISHED : (body.status as PageStatus),
          draftBlocks: blocks as never,
          // A page created as a draft has *no* published blocks, not empty ones. Empty and absent are
          // different answers to "is this page live", and the storefront's read asks the second.
          publishedBlocks: published ? (blocks as never) : ([] as never),
          seo: (seo ?? null) as never,
        },
        select: { id: true, slug: true },
      });

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: published ? "PAGE_PUBLISHED" : "PAGE_SAVED_DRAFT",
        entityType: "PAGE",
        entityId: page.id,
        meta: { slug: page.slug, title: body.title, blocks: blocks.length },
      });

      return { id: page.id, slug: page.slug };
    });
  }

  @Patch(":id")
  async update(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: SavePageDto,
  ): Promise<{ id: string; slug: string }> {
    const admin = await requireAdmin(this.auth, req);

    return this.db.$transaction(async (tx) => {
      const existing = await tx.page.findUnique({ where: { id } });
      // A lookup before anything is written, rather than a bare `update`: an update against an id that
      // is not there is a Prisma error the panel reported as "ذخیره انجام نشد" — indistinguishable
      // from a database being down. A stale form is a 404 and says so.
      if (!existing) throw new PageNotFoundException();

      assertSlugIsMovable(existing, body.slug);

      const blocks = validateBlocks(body.blocks);
      const seo = parsePageSeo(body.seo);
      if (body.slug !== existing.slug) await assertSlugFree(tx, body.slug, id);

      const published = body.action === PageActionDto.PUBLISH;
      const page = await tx.page.update({
        where: { id },
        data: {
          slug: body.slug,
          title: body.title,
          status: published ? PageStatus.PUBLISHED : (body.status as PageStatus),
          draftBlocks: blocks as never,
          ...(published ? { publishedBlocks: blocks as never } : {}),
          seo: (seo ?? null) as never,
        },
        select: { id: true, slug: true },
      });

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: published ? "PAGE_PUBLISHED" : "PAGE_SAVED_DRAFT",
        entityType: "PAGE",
        entityId: id,
        meta: { slug: page.slug, title: body.title, blocks: blocks.length },
      });

      return { id: page.id, slug: page.slug };
    });
  }

  /**
   * Delete a draft page.
   *
   * The system pages are refused by kind rather than by id, because the ids are an implementation
   * detail the panel never sees and a rule keyed on them would be a rule that breaks when the seed
   * changes.
   */
  @Delete(":id")
  async remove(@Req() req: Request, @Param("id") id: string): Promise<{ deleted: true }> {
    const admin = await requireAdmin(this.auth, req);

    return this.db.$transaction(async (tx) => {
      const page = await tx.page.findUnique({ where: { id } });
      // The panel had no existence check here, so a stale form raised a raw Prisma error instead of a
      // sentence an operator could read.
      if (!page) throw new PageNotFoundException();

      if (page.kind === "SYSTEM") {
        throw new PageNotFoundException("صفحات سیستمی حذف نمی‌شوند");
      }
      assertPageIsDeletable(page);

      await tx.page.delete({ where: { id } });

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "PAGE_DELETED",
        entityType: "PAGE",
        entityId: id,
        meta: { slug: page.slug },
      });

      return { deleted: true };
    });
  }

  /**
   * The page-builder's vocabulary, served so a form can offer only the blocks it can store.
   *
   * The same reason the settings definitions are served: the alternative is a second list of block
   * types in the client, free to disagree with the one that is actually applied on the way in.
   */
  @Get("block-types")
  blockTypes(): string[] {
    return Object.keys(componentSchemas);
  }
}

/**
 * Is this slug free?
 *
 * Asked inside the transaction so the answer and the write cannot disagree, and it is not a substitute
 * for the unique index: two operators saving the same slug at the same moment can both read "free".
 */
async function assertSlugFree(tx: Tx, slug: string, exceptId: string | null): Promise<void> {
  const taken = await tx.page.findFirst({ where: { slug } });
  if (taken && taken.id !== exceptId) throw new PageSlugTakenException(slug);
}

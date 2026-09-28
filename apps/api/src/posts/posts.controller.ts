// Blog posts, at the operator's edge.
//
// The panel wrote the post, its tags and the audit line in one transaction but wrote the audit line
// *after* it, so a failed audit write was a changed post nobody could account for. And it decided a
// slug collision by matching the text of a Prisma error, which reports a collision and an unrelated
// failure with the same sentence.
//
// The vocabulary moves too: `postBodySchema` was run by the panel as a fast-fail before its own
// write, which is a rule a client may skip, and it is now the only check there is.

import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { writeAudit } from "../common/audit.js";
import { AuthService } from "../auth/auth.service.js";
import { requireAdmin } from "../auth/identity.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { PostStatus } from "../generated/prisma/enums";
import { PostListQueryDto, SavePostDto } from "./dto/post.dto.js";
import { normaliseTags, matchesSearch, parseBody, parsePostSeo, searchTextFor } from "./posts.service.js";
import { PostNotFoundException, PostSlugTakenException } from "./exceptions/post.exception.js";

type Tx = Prisma.TransactionClient;

/**
 * One post as the blog table renders it.
 *
 * `tags` is a list of names and not a list of `{ tag: { name } }`, because the column shows names and
 * the nesting was the panel's to reach through. `publishAt` is a `Date` here and an ISO string on the
 * wire; the panel's formatter takes a `Date` and the page converts.
 */
export interface PostSummary {
  id: string;
  title: string;
  status: string;
  featured: boolean;
  publishAt: Date | null;
  tags: string[];
}

/** One post in full, as the editor seeds itself from it. */
export interface PostDetail {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string;
  byline: string;
  status: string;
  featured: boolean;
  commentsEnabled: boolean;
  publishAt: Date | null;
  tags: string[];
  seo: Record<string, unknown>;
  body: { type: string; content?: unknown[] };
}

@Controller("posts")
export class PostsController {
  constructor(
    private readonly auth: AuthService,
    // The data client arrives through the module that owns it, the same as every other feature.
    @Inject(DATA_CLIENT) private readonly db: PrismaClient,
  ) {}

  /**
   * The blog list: the posts, filtered and paged, with the count the panel's pager divides by.
   *
   * One read rather than the page's own `findMany` plus `count`, because the two were two statements
   * about the same predicate and a post saved between them produced a pager whose page count
   * disagreed with the rows on it. The count travels with the rows for that reason alone.
   *
   * The tag names are flattened here rather than left as `tags[].tag.name` for the JSX to reach into:
   * a list that answers with the shape the table renders leaves nothing for the page to translate.
   */
  @Get()
  async list(
    @Req() req: Request,
    @Query() query: PostListQueryDto,
  ): Promise<{ rows: PostSummary[]; total: number; page: number; size: number }> {
    await requireAdmin(this.auth, req);

    const q = query.q?.trim();
    const where: Prisma.PostWhereInput = {
      ...(query.status ? { status: query.status as PostStatus } : {}),
      ...(q ? matchesSearch(q) : {}),
    };

    const [rows, total] = await Promise.all([
      this.db.post.findMany({
        where,
        // Featured first, then newest: the panel's own order, and the one the table was drawn to.
        orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.size,
        take: query.size,
        include: { tags: { include: { tag: { select: { name: true } } } } },
      }),
      this.db.post.count({ where }),
    ]);

    return {
      rows: rows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        featured: row.featured,
        publishAt: row.publishAt,
        tags: row.tags.map((entry) => entry.tag.name),
      })),
      total,
      page: query.page,
      size: query.size,
    };
  }

  /**
   * One post, whole, for the editor to seed itself from.
   *
   * The write answers `{ id, slug }` because a form that saved does not need the row back. The editor
   * does: it renders the title, the byline, the tags, the SEO block and the body, and it was fetching
   * each of those from the panel's own copy of the row. One read, and the form cannot be seeded from
   * a shape the gateway does not serve.
   *
   * A 404 rather than a null, for the reason the discount read is: an empty form rendered against an
   * id that names nothing is a form that saves over whatever the id actually was.
   */
  @Get(":id")
  async one(@Req() req: Request, @Param("id") id: string): Promise<PostDetail> {
    await requireAdmin(this.auth, req);

    const post = await this.db.post.findUnique({
      where: { id },
      include: { tags: { include: { tag: { select: { name: true } } } } },
    });
    if (!post) throw new PostNotFoundException();

    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      // Empty rather than null: every one of these is a text input in the editor, and "no byline" is
      // an empty box rather than an absent field the form has to decide what to do with.
      excerpt: post.excerpt ?? "",
      coverImage: post.coverImage ?? "",
      byline: post.byline ?? "",
      status: post.status,
      featured: post.featured,
      commentsEnabled: post.commentsEnabled,
      publishAt: post.publishAt,
      tags: post.tags.map((entry) => entry.tag.name),
      seo: (post.seo ?? {}) as Record<string, unknown>,
      // The stored document, defaulted to an empty one. A post with no body is a post the editor can
      // still open and write into; a read that refused it would leave no way to fix it.
      body: (post.body ?? { type: "doc", content: [] }) as { type: string; content?: unknown[] },
    };
  }
  @Post()
  async create(@Req() req: Request, @Body() body: SavePostDto): Promise<{ id: string; slug: string }> {
    const admin = await requireAdmin(this.auth, req);

    return this.db.$transaction(async (tx) => {
      const parsedBody = parseBody(body.body);
      const tags = normaliseTags(body.tags);
      const seo = parsePostSeo(body.seo);
      await assertSlugFree(tx, body.slug, null);

      const post = await tx.post.create({
        data: {
          slug: body.slug,
          title: body.title,
          excerpt: body.excerpt?.trim() || null,
          coverImage: body.coverImage?.trim() || null,
          byline: body.byline?.trim() || null,
          status: PostStatus.DRAFT,
          publishAt: body.publishAt ? new Date(body.publishAt) : null,
          featured: body.featured ?? false,
          commentsEnabled: body.commentsEnabled ?? true,
          body: parsedBody as never,
          seo: (seo ?? null) as never,
          // Derived from the *parsed* body, so what is indexed is what was stored.
          searchText: searchTextFor(parsedBody),
        },
        select: { id: true, slug: true },
      });

      await replaceTags(tx, post.id, tags);

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "POST_CREATED",
        entityType: "POST",
        entityId: post.id,
        meta: { slug: post.slug, title: body.title, tags: tags.length },
      });

      return { id: post.id, slug: post.slug };
    });
  }

  @Patch(":id")
  async update(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: SavePostDto,
  ): Promise<{ id: string; slug: string }> {
    const admin = await requireAdmin(this.auth, req);

    return this.db.$transaction(async (tx) => {
      const existing = await tx.post.findUnique({ where: { id } });
      // A lookup before anything is written, rather than a bare `update`: an update against an id that
      // is not there is a Prisma error the panel reported as "ذخیره انجام نشد" — indistinguishable
      // from a database being down. A stale form is a 404 and says so.
      if (!existing) throw new PostNotFoundException();

      const parsedBody = parseBody(body.body);
      const tags = normaliseTags(body.tags);
      const seo = parsePostSeo(body.seo);
      if (body.slug !== existing.slug) await assertSlugFree(tx, body.slug, id);

      const post = await tx.post.update({
        where: { id },
        data: {
          slug: body.slug,
          title: body.title,
          excerpt: body.excerpt?.trim() || null,
          coverImage: body.coverImage?.trim() || null,
          byline: body.byline?.trim() || null,
          publishAt: body.publishAt ? new Date(body.publishAt) : null,
          featured: body.featured ?? false,
          commentsEnabled: body.commentsEnabled ?? true,
          body: parsedBody as never,
          seo: (seo ?? null) as never,
          searchText: searchTextFor(parsedBody),
        },
        select: { id: true, slug: true },
      });

      await replaceTags(tx, id, tags);

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "POST_UPDATED",
        entityType: "POST",
        entityId: id,
        meta: { slug: post.slug, title: body.title, tags: tags.length },
      });

      return { id: post.id, slug: post.slug };
    });
  }

  /**
   * Delete a post, its tags and the audit line together.
   *
   * The join rows go with it explicitly. Nothing cascades, so without this the delete raises a foreign
   * key error — and the panel's `deletePost` had no catch around it, so a tagged post could not be
   * deleted from the panel at all. The same class of gap the category and product deletes had.
   */
  @Delete(":id")
  async remove(@Req() req: Request, @Param("id") id: string): Promise<{ deleted: true }> {
    const admin = await requireAdmin(this.auth, req);

    return this.db.$transaction(async (tx) => {
      const post = await tx.post.findUnique({ where: { id } });
      if (!post) throw new PostNotFoundException();

      await tx.postTag.deleteMany({ where: { postId: id } });
      await tx.post.delete({ where: { id } });

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "POST_DELETED",
        entityType: "POST",
        entityId: id,
        meta: { slug: post.slug, title: post.title },
      });

      return { deleted: true };
    });
  }
}

/**
 * A post's tags, replaced as a set.
 *
 * Replace rather than patch, for the reason the collection's membership is: the form sends every tag
 * and a tag it no longer sends is one the operator removed. The `BlogTag` rows themselves are *not*
 * deleted — a tag is shared between posts, and removing the row would remove the tag from every other
 * post that carries it.
 */
async function replaceTags(
  tx: Tx,
  postId: string,
  tags: { name: string; slug: string }[],
): Promise<void> {
  await tx.postTag.deleteMany({ where: { postId } });

  for (const tag of tags) {
    const row = await tx.blogTag.upsert({
      where: { slug: tag.slug },
      update: { name: tag.name },
      create: { name: tag.name, slug: tag.slug },
      select: { id: true },
    });
    await tx.postTag.create({ data: { postId, tagId: row.id } });
  }
}

/**
 * Is this slug free?
 *
 * Asked inside the transaction so the answer and the write cannot disagree, and it is not a substitute
 * for the unique index: two operators saving the same slug at the same moment can both read "free".
 */
async function assertSlugFree(tx: Tx, slug: string, exceptId: string | null): Promise<void> {
  const taken = await tx.post.findFirst({ where: { slug } });
  if (taken && taken.id !== exceptId) throw new PostSlugTakenException(slug);
}

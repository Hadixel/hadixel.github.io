"use server";

import { redirect } from "next/navigation";
import { db, $Enums } from "@kmodern/db";
import { blockSchema, componentSchemas, postBodySchema, seoSchema } from "@kmodern/schema";
import { actionContext } from "./ctx";
import { field, jsonParse } from "./form-helpers";
import { recordAudit } from "@/lib/audit";
import type { ActionState } from "./auth";

// ---------------------------------------------------------------
// Pages (005) — page-builder block list
// ---------------------------------------------------------------

interface BlockInput {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

function validateBlocks(raw: unknown): { ok: true; blocks: Array<{ id: string; type: string; props: unknown }> } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "لیست بلوک‌ها نامعتبر است" };
  const blocks: Array<{ id: string; type: string; props: unknown }> = [];
  for (const b of raw as BlockInput[]) {
    const parsed = blockSchema.safeParse(b);
    if (!parsed.success) return { ok: false, error: `بلوک نامعتبر: ${parsed.error.issues[0]?.message ?? ""}` };
    const schema = componentSchemas[parsed.data.type as keyof typeof componentSchemas];
    const props = schema.safeParse(parsed.data.props);
    if (!props.success) {
      return { ok: false, error: `ویژگی‌های بلوک «${parsed.data.type}» نامعتبر است: ${props.error.issues[0]?.message ?? ""}` };
    }
    blocks.push({ id: parsed.data.id, type: parsed.data.type, props: props.data });
  }
  return { ok: true, blocks };
}

export async function savePage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, ip, ua } = await actionContext();
  const id = field(formData, "id");
  const title = field(formData, "title");
  const slug = field(formData, "slug");
  const status = field(formData, "status") as $Enums.PageStatus;
  const action = field(formData, "action") as "draft" | "publish";
  const blocksRaw = jsonParse<unknown>(formData.get("blocks") as string | null, []);
  const seoRaw = jsonParse<Record<string, unknown>>(formData.get("seo") as string | null, {});

  if (!title || !slug) return { error: "عنوان و اسلاگ الزامی است" };
  const validated = validateBlocks(blocksRaw);
  if (!validated.ok) return { error: validated.error };
  const seoParsed = seoSchema.safeParse(seoRaw);
  if (!seoParsed.success) return { error: `SEO نامعتبر است: ${seoParsed.error.issues[0]?.message ?? ""}` };

  const page = id ? await db().page.findUnique({ where: { id } }) : null;
  if (id && !page) return { error: "صفحه پیدا نشد" };
  if (page?.kind === "SYSTEM" && page.slug !== slug) {
    return { error: "اسلاگ صفحات سیستمی قابل تغییر نیست" };
  }

  const publish = action === "publish";
  const data = {
    title,
    draftBlocks: validated.blocks as never,
    ...(publish ? { publishedBlocks: validated.blocks as never, status: "PUBLISHED" as const } : { status: status || "DRAFT" }),
    seo: seoParsed.data as never,
  };

  try {
    if (page) {
      await db().page.update({ where: { id }, data });
    } else {
      await db().page.create({
        data: {
          slug,
          kind: "CUSTOM",
          ...data,
          publishedBlocks: publish ? (validated.blocks as never) : [],
        },
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطای ناشناخته";
    if (msg.includes("slug") && msg.includes("Unique")) return { error: "این اسلاگ قبلاً استفاده شده است" };
    return { error: `ذخیره نشد: ${msg}` };
  }

  await recordAudit({
    adminUserId: admin.id,
    action: publish ? "PAGE_PUBLISHED" : "PAGE_SAVED_DRAFT",
    entityType: "PAGE",
    entityId: id,
    meta: { slug, title, blocks: validated.blocks.length, ip, ua },
  });
  return { ok: true, message: publish ? "صفحه منتشر شد" : "پیش‌نویس ذخیره شد" };
}

export async function deletePage(formData: FormData) {
  const { admin, ip, ua } = await actionContext();
  const id = field(formData, "id");
  const page = await db().page.findUnique({ where: { id } });
  if (!page) return { error: "صفحه پیدا نشد" };
  if (page.kind === "SYSTEM") return { error: "صفحات سیستمی حذف نمی‌شوند" };
  if (page.status === "PUBLISHED") return { error: "ابتدا صفحه را به پیش‌نویس ببرید؛ فقط پیش‌نویس حذف می‌شود" };
  await db().page.delete({ where: { id } });
  await recordAudit({
    adminUserId: admin.id,
    action: "PAGE_DELETED",
    entityType: "PAGE",
    entityId: id,
    meta: { slug: page.slug, ip, ua },
  });
  return { ok: true };
}

export async function deletePageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return deletePage(formData);
}

// ---------------------------------------------------------------
// Blog (007) — TipTap-style JSON doc
// ---------------------------------------------------------------

export async function savePost(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, ip, ua } = await actionContext();
  const id = field(formData, "id");
  const slug = field(formData, "slug");
  const title = field(formData, "title");
  const excerpt = field(formData, "excerpt");
  const coverImage = field(formData, "coverImage");
  const byline = field(formData, "byline");
  const status = field(formData, "status") as $Enums.PostStatus;
  const featured = formData.get("featured") === "on";
  const commentsEnabled = formData.get("commentsEnabled") === "on";
  const publishAtRaw = field(formData, "publishAt");
  const body = jsonParse<unknown>(formData.get("body") as string | null, { type: "doc", content: [] });
  const seoRaw = jsonParse<Record<string, unknown>>(formData.get("seo") as string | null, {});
  const tags = jsonParse<string[]>(formData.get("tags") as string | null, []);

  if (!title || !slug) return { error: "عنوان و اسلاگ الزامی است" };
  if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)) return { error: "وضعیت نامعتبر است" };

  const bodyParsed = postBodySchema.safeParse(body);
  if (!bodyParsed.success) {
    return { error: `بدنهٔ پست نامعتبر است: ${bodyParsed.error.issues[0]?.message ?? ""}` };
  }
  const seoParsed = seoSchema.safeParse(seoRaw);
  if (!seoParsed.success) return { error: `SEO نامعتبر است: ${seoParsed.error.issues[0]?.message ?? ""}` };

  try {
    await db().$transaction(async (tx) => {
      const post = id
        ? await tx.post.update({
            where: { id },
            data: {
              slug,
              title,
              excerpt: excerpt || null,
              coverImage: coverImage || null,
              byline: byline || null,
              status,
              featured,
              commentsEnabled,
              publishAt: publishAtRaw ? new Date(publishAtRaw) : null,
              body: bodyParsed.data as never,
              seo: seoParsed.data as never,
              searchText: extractSearchText(bodyParsed.data),
            },
          })
        : await tx.post.create({
            data: {
              slug,
              title,
              excerpt: excerpt || null,
              coverImage: coverImage || null,
              byline: byline || null,
              status,
              featured,
              commentsEnabled,
              publishAt: publishAtRaw ? new Date(publishAtRaw) : null,
              body: bodyParsed.data as never,
              seo: seoParsed.data as never,
              searchText: extractSearchText(bodyParsed.data),
            },
          });

      await tx.postTag.deleteMany({ where: { postId: post.id } });
      for (const name of tags) {
        const clean = name.trim();
        if (!clean) continue;
        const tagSlug =
          clean.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, "-").replace(/^-|-$/g, "") || "tag";
        const tag = await tx.blogTag.upsert({
          where: { slug: tagSlug },
          update: { name: clean },
          create: { name: clean, slug: tagSlug },
        });
        await tx.postTag.create({ data: { postId: post.id, tagId: tag.id } });
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطای ناشناخته";
    if (msg.includes("slug") && msg.includes("Unique")) return { error: "این اسلاگ قبلاً استفاده شده است" };
    return { error: `ذخیره نشد: ${msg}` };
  }

  await recordAudit({
    adminUserId: admin.id,
    action: id ? "POST_UPDATED" : "POST_CREATED",
    entityType: "POST",
    entityId: id,
    meta: { slug, title, status, ip, ua },
  });
  redirect("/blog");
}

/** plain-text search index from the doc (007: searchText for ILIKE) */
function extractSearchText(doc: { content?: unknown[] }): string {
  const parts: string[] = [];
  const walk = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes as Array<{ type?: string; text?: string; content?: unknown }>) {
      if (node.text) parts.push(node.text);
      walk(node.content);
    }
  };
  walk(doc.content);
  return parts.join(" ").slice(0, 2000);
}

// ---------------------------------------------------------------
// Navigation (006) — full menu tree replace per location
// ---------------------------------------------------------------

interface PromoInput {
  imageUrl: string;
  alt?: string;
  link: Record<string, unknown>;
  heading?: string;
  subtext?: string;
  mobileVisible?: boolean;
}

interface MenuItemInput {
  label: string;
  target: Record<string, unknown>;
  childSource?: "STATIC" | "CATEGORY";
  categoryId?: string;
  display?: "DROPDOWN" | "MEGA";
  visible?: boolean;
  mobileVisible?: boolean;
  sortOrder?: number;
  children?: MenuItemInput[];
  promos?: PromoInput[];
}

export async function saveNav(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, ip, ua } = await actionContext();
  const location = field(formData, "location") as $Enums.MenuLocation;
  const name = field(formData, "name");
  const items = jsonParse<MenuItemInput[]>(formData.get("items") as string | null, []);

  if (!["HEADER", "FOOTER", "MOBILE"].includes(location)) return { error: "موقعیت نامعتبر است" };
  if (!name) return { error: "نام منو الزامی است" };

  const menu = await db().menu.findUnique({ where: { location } });
  if (!menu) return { error: "منو پیدا نشد" };

  await db().$transaction(async (tx) => {
    await tx.menuItem.deleteMany({ where: { menuId: menu.id } });
    await tx.menu.update({ where: { id: menu.id }, data: { name } });

    const createItem = async (item: MenuItemInput, parentId: string | null, sortOrder: number) => {
      const created = await tx.menuItem.create({
        data: {
          menuId: menu.id,
          parentId,
          sortOrder,
          label: item.label,
          target: item.target as never,
          childSource: item.childSource ?? "STATIC",
          categoryId: item.categoryId || null,
          display: item.display ?? "DROPDOWN",
          visible: item.visible ?? true,
          mobileVisible: item.mobileVisible ?? true,
          promos: {
            create: (item.promos ?? []).map((p, i) => ({
              sortOrder: i,
              imageUrl: p.imageUrl,
              alt: p.alt ?? "",
              link: p.link as never,
              heading: p.heading ?? null,
              subtext: p.subtext ?? null,
              mobileVisible: p.mobileVisible ?? false,
            })),
          },
        },
      });
      for (let i = 0; i < (item.children ?? []).length; i++) {
        await createItem(item.children![i], created.id, i);
      }
      return created;
    };

    for (let i = 0; i < items.length; i++) {
      await createItem(items[i], null, i);
    }
  });

  await recordAudit({
    adminUserId: admin.id,
    action: "MENU_SAVED",
    entityType: "MENU",
    entityId: menu.id,
    meta: { location, itemCount: items.length, ip, ua },
  });
  return { ok: true, message: "منو ذخیره شد" };
}

export async function deletePost(formData: FormData) {
  const { admin, ip, ua } = await actionContext();
  const id = field(formData, "id");
  const post = await db().post.findUnique({ where: { id } });
  if (!post) return { error: "نوشته پیدا نشد" };
  await db().post.delete({ where: { id } });
  await recordAudit({
    adminUserId: admin.id,
    action: "POST_DELETED",
    entityType: "POST",
    entityId: id,
    meta: { slug: post.slug, title: post.title, ip, ua },
  });
  return { ok: true };
}

export async function deletePostAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return deletePost(formData);
}

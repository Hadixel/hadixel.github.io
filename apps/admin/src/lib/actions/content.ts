"use server";

import { redirect } from "next/navigation";
import { db, $Enums } from "@kmodern/db";
import { blockSchema, componentSchemas, menuSchema, postBodySchema, seoSchema } from "@kmodern/schema";
import { MAX_SAFE_HTML_LENGTH, sanitizeAdminHtml } from "@kmodern/schema/sanitize";
import { actionContext } from "./ctx";
import { field, jsonParse } from "./form-helpers";
import { recordAudit } from "@/lib/audit";
import { fromDateTimeLocal } from "@/lib/date";
import type { MenuItemValue } from "@kmodern/schema";
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
  if (raw.length > 200) return { ok: false, error: "تعداد بلوک‌های صفحه بیش از حد مجاز است" };
  const blocks: Array<{ id: string; type: string; props: unknown }> = [];
  for (const b of raw as BlockInput[]) {
    const parsed = blockSchema.safeParse(b);
    if (!parsed.success) return { ok: false, error: `بلوک نامعتبر: ${parsed.error.issues[0]?.message ?? ""}` };
    const schema = componentSchemas[parsed.data.type as keyof typeof componentSchemas];
    const props = schema.safeParse(parsed.data.props);
    if (!props.success) {
      return { ok: false, error: `ویژگی‌های بلوک «${parsed.data.type}» نامعتبر است: ${props.error.issues[0]?.message ?? ""}` };
    }
    const safeProps = parsed.data.type === "richText" || parsed.data.type === "customHtml"
      ? (() => {
          const html = (props.data as { html?: unknown }).html;
          if (typeof html !== "string") return null;
          if (html.length > MAX_SAFE_HTML_LENGTH) return null;
          return { ...props.data, html: sanitizeAdminHtml(html) };
        })()
      : props.data;
    if (!safeProps) return { ok: false, error: "HTML بلوک نامعتبر یا بیش از حد بزرگ است" };
    blocks.push({ id: parsed.data.id, type: parsed.data.type, props: safeProps });
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
  const blocksValue = formData.get("blocks");
  if (blocksValue === null) return { error: "بلوک‌های صفحه ارسال نشده است" };
  if (typeof blocksValue === "string" && blocksValue.length > 500_000) return { error: "حجم بلوک‌های صفحه بیش از حد مجاز است" };
  const blocksRaw = jsonParse<unknown>(blocksValue as string | null, []);
  let seoRaw: Record<string, unknown>;
  try {
    const seoValue = formData.get("seo");
    if (seoValue === null) return { error: "داده‌های SEO ارسال نشده است" };
    seoRaw = typeof seoValue === "string" ? JSON.parse(seoValue) : {};
  } catch {
    return { error: "داده‌های SEO نامعتبر است" };
  }

  if (!title || !slug) return { error: "عنوان و اسلاگ الزامی است" };
  if (title.length > 300 || slug.length > 200) return { error: "عنوان یا اسلاگ بیش از حد طولانی است" };
  if (!["draft", "publish"].includes(action)) return { error: "عملیات ذخیره نامعتبر است" };
  if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)) return { error: "وضعیت صفحه نامعتبر است" };
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

  let savedId = id;
  try {
    if (page) {
      await db().page.update({ where: { id }, data });
    } else {
      const created = await db().page.create({
        data: {
          slug,
          kind: "CUSTOM",
          ...data,
          publishedBlocks: publish ? (validated.blocks as never) : [],
        },
        select: { id: true },
      });
      savedId = created.id;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطای ناشناخته";
    if (msg.includes("slug") && msg.includes("Unique")) return { error: "این اسلاگ قبلاً استفاده شده است" };
    return { error: "ذخیره انجام نشد؛ دوباره تلاش کنید" };
  }

  await recordAudit({
    adminUserId: admin.id,
    action: publish ? "PAGE_PUBLISHED" : "PAGE_SAVED_DRAFT",
    entityType: "PAGE",
    entityId: savedId,
    meta: { slug, title, blocks: validated.blocks.length, ip, ua },
  });
  return { ok: true, id: savedId, message: publish ? "صفحه منتشر شد" : "پیش‌نویس ذخیره شد" };
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
  let body: unknown;
  let seoRaw: Record<string, unknown>;
  let tags: string[];
  try {
    const bodyRaw = formData.get("body");
    const seoValue = formData.get("seo");
    const tagsValue = formData.get("tags");
    if (typeof bodyRaw === "string" && bodyRaw.length > 1_000_000) throw new Error("body_too_large");
    body = typeof bodyRaw === "string" ? JSON.parse(bodyRaw) : { type: "doc", content: [] };
    seoRaw = typeof seoValue === "string" ? JSON.parse(seoValue) : {};
    const parsedTags = typeof tagsValue === "string" ? JSON.parse(tagsValue) : [];
    if (!Array.isArray(parsedTags) || parsedTags.some((tag) => typeof tag !== "string")) throw new Error("tags");
    tags = parsedTags;
  } catch {
    return { error: "داده‌های JSON پست نامعتبر است" };
  }

  if (!title || !slug) return { error: "عنوان و اسلاگ الزامی است" };
  if (title.length > 300 || slug.length > 200) return { error: "عنوان یا اسلاگ بیش از حد طولانی است" };
  if (excerpt.length > 1000 || byline.length > 200 || coverImage.length > 2000) return { error: "اطلاعات نوشته بیش از حد طولانی است" };
  if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)) return { error: "وضعیت نامعتبر است" };
  if (tags.length > 20 || tags.some((tag) => !tag.trim() || tag.length > 50)) return { error: "برچسب‌ها نامعتبر هستند" };
  const publishAt = publishAtRaw ? fromDateTimeLocal(publishAtRaw) : null;
  if (publishAt && Number.isNaN(publishAt.getTime())) return { error: "زمان انتشار نامعتبر است" };

  const bodyParsed = postBodySchema.safeParse(body);
  if (bodyParsed.success && bodyParsed.data.content.length > 1000) return { error: "تعداد بندهای پست بیش از حد مجاز است" };
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
              publishAt,
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
              publishAt,
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
    return { error: "ذخیره انجام نشد؛ دوباره تلاش کنید" };
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

type MenuItemInput = MenuItemValue;

export async function saveNav(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, ip, ua } = await actionContext();
  const location = field(formData, "location") as $Enums.MenuLocation;
  const name = field(formData, "name");
  const itemsRaw = formData.get("items");
  if (typeof itemsRaw !== "string" || itemsRaw.length > 200_000) return { error: "حجم ساختار منو بیش از حد مجاز است" };
  let items: MenuItemInput[];
  try {
    const parsed: unknown = JSON.parse(typeof itemsRaw === "string" ? itemsRaw : "null");
    if (!Array.isArray(parsed)) return { error: "ساختار منو نامعتبر است" };
    items = parsed as MenuItemInput[];
  } catch {
    return { error: "ساختار منو نامعتبر است" };
  }

  if (!["HEADER", "FOOTER", "MOBILE"].includes(location)) return { error: "موقعیت نامعتبر است" };
  if (!name) return { error: "نام منو الزامی است" };

  const parsedMenu = menuSchema.safeParse({ location, name, items });
  if (!parsedMenu.success) return { error: `ساختار منو نامعتبر است: ${parsedMenu.error.issues[0]?.message ?? ""}` };
  const validItems = parsedMenu.data.items;
  const hasMissingCategory = validItems.some((item) => item.childSource === "CATEGORY" && !item.categoryId);
  if (hasMissingCategory) return { error: "برای منوی خودکار دسته را انتخاب کنید" };
  let itemCount = 0;
  const validateDepth = (nodes: MenuItemValue[], depth = 1): void => {
    if (depth > 5) throw new Error("NAV_DEPTH");
    for (const node of nodes) {
      if (node.childSource === "CATEGORY" && !node.categoryId) throw new Error("NAV_CATEGORY");
      itemCount += 1;
      if (itemCount > 200) throw new Error("NAV_SIZE");
      validateDepth(node.children, depth + 1);
    }
  };
  try {
    validateDepth(validItems);
  } catch (error) {
    return { error: error instanceof Error && error.message === "NAV_DEPTH" ? "عمق منو بیش از حد مجاز است" : error instanceof Error && error.message === "NAV_CATEGORY" ? "دستهٔ منو انتخاب نشده است" : "تعداد آیتم‌های منو بیش از حد مجاز است" };
  }

  const targetIds = new Set<string>();
  const categoryIds = new Set<string>();
  const collectTargets = (nodes: MenuItemValue[]): void => {
    for (const node of nodes) {
      if ("targetId" in node.target) targetIds.add(`${node.target.type}:${node.target.targetId}`);
      if (node.childSource === "CATEGORY" && node.categoryId) categoryIds.add(node.categoryId);
      for (const promo of node.promos) {
        if ("targetId" in promo.link) targetIds.add(`${promo.link.type}:${promo.link.targetId}`);
      }
      collectTargets(node.children);
    }
  };
  collectTargets(validItems);
  const pageIds = [...targetIds].filter((id) => id.startsWith("PAGE:")).map((id) => id.slice(5));
  const collectionIds = [...targetIds].filter((id) => id.startsWith("COLLECTION:")).map((id) => id.slice(11));
  const targetCategoryIds = [...targetIds].filter((id) => id.startsWith("CATEGORY:")).map((id) => id.slice(9));
  const targetPostIds = [...targetIds].filter((id) => id.startsWith("BLOG_POST:")).map((id) => id.slice(10));
  const [pages, categories, collections, posts] = await Promise.all([
    pageIds.length ? db().page.findMany({ where: { id: { in: pageIds } }, select: { id: true } }) : [],
    [...new Set([...targetCategoryIds, ...categoryIds])].length ? db().category.findMany({ where: { id: { in: [...new Set([...targetCategoryIds, ...categoryIds])] } }, select: { id: true } }) : [],
    collectionIds.length ? db().collection.findMany({ where: { id: { in: collectionIds } }, select: { id: true } }) : [],
    targetPostIds.length ? db().post.findMany({ where: { id: { in: targetPostIds } }, select: { id: true } }) : [],
  ]);
  const pageSet = new Set(pages.map((row) => row.id));
  const categorySet = new Set(categories.map((row) => row.id));
  const collectionSet = new Set(collections.map((row) => row.id));
  const postSet = new Set(posts.map((row) => row.id));
  for (const target of targetIds) {
    const [type, id] = target.split(":");
    if ((type === "PAGE" && !pageSet.has(id)) || (type === "CATEGORY" && !categorySet.has(id)) || (type === "COLLECTION" && !collectionSet.has(id)) || (type === "BLOG_POST" && !postSet.has(id))) {
      return { error: "یکی از لینک‌های منو به مقصد موجود اشاره می‌کند" };
    }
  }
  for (const id of categoryIds) if (!categorySet.has(id)) return { error: "دستهٔ منو پیدا نشد" };

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

    for (let i = 0; i < validItems.length; i++) {
      await createItem(validItems[i], null, i);
    }
  });

  await recordAudit({
    adminUserId: admin.id,
    action: "MENU_SAVED",
    entityType: "MENU",
    entityId: menu.id,
    meta: { location, itemCount: validItems.length, ip, ua },
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

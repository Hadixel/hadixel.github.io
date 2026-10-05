// Blog content importer: content/blog/*.json -> Post/BlogTag/PostTag rows.
// Run: pnpm blog:import   (requires DATABASE_URL live — same as db:seed)
//
// Mirrors savePost() in apps/admin/src/lib/actions/content.ts: same zod
// validation, same searchText/tag-slug helpers (single-sourced in
// @kmodern/contracts), so a file and a hand-authored post are the same thing.
//
// Idempotent: upserts by slug. publishAt is set only on create, staggered by
// filename order, so re-running never reorders the /blog listing. The newest
// post is the hero card (getPublishedPosts orders by publishAt desc).
//
// Hard gates — an invented product id or image path fails the import rather
// than shipping a dead embed:
//   - productCard attrs.productId must exist in Product
//   - every image src (cover + inline) must be a real file under
//     apps/store/public

import "dotenv/config";
import { readdir, readFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  blogTagSlug,
  extractSearchText,
  postBodySchema,
  seoSchema,
  type PostBody,
  type PostSeo,
} from "@kmodern/contracts";
import { createPrismaClient, type PostStatus } from "../src/prisma/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "..", "..", "..", "content", "blog");
const PUBLIC_DIR = join(HERE, "..", "..", "..", "apps", "store", "public");
const BASE = process.env.BLOG_PUBLISH_BASE ? new Date(process.env.BLOG_PUBLISH_BASE) : new Date();

interface PostFile {
  slug: string;
  title: string;
  excerpt?: string;
  coverImage?: string;
  byline?: string;
  status: PostStatus;
  featured?: boolean;
  commentsEnabled?: boolean;
  tags: string[];
  seo: unknown;
  body: unknown;
}

type ParsedFile = { file: string; data: PostFile; body: PostBody; seo: PostSeo };

const problems: string[] = [];
function require(ok: boolean, file: string, message: string) {
  if (!ok) problems.push(`${file}: ${message}`);
}

/** All node attrs.image-ish srcs in a doc, plus the cover. */
function collectImageSrcs(body: unknown, out: string[] = []): string[] {
  if (Array.isArray(body)) {
    for (const item of body) collectImageSrcs(item, out);
    return out;
  }
  if (!body || typeof body !== "object") return out;
  const node = body as Record<string, unknown>;
  for (const key of ["src", "url"] as const) {
    const value = node[key];
    if (typeof value === "string" && value.startsWith("/")) out.push(value);
  }
  if (node.type === "imageGallery" && node.attrs && typeof node.attrs === "object") {
    for (const image of (node.attrs as { images?: unknown }).images ?? []) {
      const src = (image as { src?: unknown }).src;
      if (typeof src === "string") out.push(src);
    }
  }
  if (node.content) collectImageSrcs(node.content, out);
  return out;
}

function collectProductIds(body: unknown, out: string[] = []): string[] {
  if (Array.isArray(body)) {
    for (const item of body) collectProductIds(item, out);
    return out;
  }
  if (!body || typeof body !== "object") return out;
  const node = body as Record<string, unknown>;
  if (node.type === "productCard" && node.attrs && typeof node.attrs === "object") {
    const id = (node.attrs as { productId?: unknown }).productId;
    if (typeof id === "string") out.push(id);
  }
  if (node.content) collectProductIds(node.content, out);
  return out;
}

async function main() {
  const files = (await readdir(CONTENT_DIR)).filter((name) => name.endsWith(".json")).sort();
  if (files.length === 0) {
    console.log(`no content files in ${CONTENT_DIR}`);
    return;
  }

  const prisma = createPrismaClient();
  try {
    const parsed: ParsedFile[] = [];

    for (const file of files) {
      const raw = await readFile(join(CONTENT_DIR, file), "utf8");
      let data: PostFile;
      try {
        data = JSON.parse(raw) as PostFile;
      } catch (e) {
        problems.push(`${file}: invalid JSON — ${e instanceof Error ? e.message : e}`);
        continue;
      }

      const expectSlug = file.replace(/\.json$/, "");
      require(data.slug ===
        expectSlug, file, `slug "${data.slug}" must match filename "${expectSlug}"`);
      require(!!data.title, file, "title required");
      require(!!data.title || data.title.length <= 300, file, "title over 300 chars");
      require((data.excerpt ?? "").length <= 1000, file, "excerpt over 1000 chars");
      require((data.byline ?? "").length <= 200, file, "byline over 200 chars");
      require((data.coverImage ?? "").length <= 2000, file, "coverImage over 2000 chars");
      require(["DRAFT", "PUBLISHED", "ARCHIVED"].includes(
        data.status,
      ), file, `invalid status "${data.status}"`);
      require(Array.isArray(data.tags), file, "tags must be an array");
      require((data.tags ?? []).length <= 20, file, "over 20 tags");
      for (const tag of data.tags ?? []) {
        require(typeof tag === "string" && tag.trim().length > 0, file, "empty tag");
        require(tag.trim().length <= 50, file, `tag over 50 chars: "${tag}"`);
      }

      const bodyParsed = postBodySchema.safeParse(data.body);
      if (!bodyParsed.success) {
        problems.push(`${file}: invalid body — ${bodyParsed.error.issues[0]?.message ?? ""}`);
        continue;
      }
      const seoParsed = seoSchema.safeParse(data.seo);
      if (!seoParsed.success) {
        problems.push(`${file}: invalid seo — ${seoParsed.error.issues[0]?.message ?? ""}`);
        continue;
      }
      if (bodyParsed.data.content.length > 1000) {
        problems.push(`${file}: over 1000 body nodes`);
        continue;
      }
      parsed.push({ file, data, body: bodyParsed.data, seo: seoParsed.data });
    }

    // Embed gates — needs the DB, so run after parsing.
    const allProductIds = [...new Set(parsed.flatMap((p) => collectProductIds(p.body)))];
    const knownProducts = new Set(
      (
        await prisma.product.findMany({
          where: { id: { in: allProductIds } },
          select: { id: true },
        })
      ).map((row) => row.id),
    );
    for (const entry of parsed) {
      for (const id of collectProductIds(entry.body)) {
        require(knownProducts.has(
          id,
        ), entry.file, `productCard references unknown product id "${id}"`);
      }
    }

    for (const src of [
      ...new Set(
        [
          ...parsed.map((p) => p.data.coverImage ?? ""),
          ...parsed.flatMap((p) => collectImageSrcs(p.body)),
        ].filter(Boolean),
      ),
    ]) {
      if (!src.startsWith("/products/")) {
        problems.push(`image "${src}" must be a local /products/... path`);
        continue;
      }
      try {
        await access(join(PUBLIC_DIR, src));
      } catch {
        problems.push(`image "${src}" does not exist under apps/store/public`);
      }
    }

    if (problems.length > 0) {
      console.error(`\n${problems.length} problem(s):`);
      for (const problem of problems) console.error(`  - ${problem}`);
      process.exitCode = 1;
      return;
    }

    let created = 0;
    let updated = 0;
    for (const [index, entry] of parsed.entries()) {
      const { data, body, seo } = entry;
      const existing = await prisma.post.findUnique({
        where: { slug: data.slug },
        select: { id: true, publishAt: true },
      });
      const fields = {
        slug: data.slug,
        title: data.title,
        excerpt: data.excerpt || null,
        coverImage: data.coverImage || null,
        byline: data.byline || null,
        status: data.status,
        featured: data.featured ?? false,
        commentsEnabled: data.commentsEnabled ?? true,
        body: body as never,
        seo: seo as never,
        searchText: extractSearchText(body),
      };
      const post = existing
        ? await prisma.post.update({ where: { id: existing.id }, data: fields })
        : await prisma.post.create({
            data: {
              ...fields,
              // newest file = newest publishAt = /blog hero card
              publishAt: new Date(BASE.getTime() - (parsed.length - 1 - index) * 60_000),
            },
          });
      if (existing) updated++;
      else created++;

      await prisma.postTag.deleteMany({ where: { postId: post.id } });
      for (const name of data.tags) {
        const clean = name.trim();
        if (!clean) continue;
        const tagSlug = blogTagSlug(clean);
        const tag = await prisma.blogTag.upsert({
          where: { slug: tagSlug },
          update: { name: clean },
          create: { name: clean, slug: tagSlug },
        });
        await prisma.postTag.create({ data: { postId: post.id, tagId: tag.id } });
      }
    }

    console.log(`imported ${parsed.length} post(s): ${created} created, ${updated} updated`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

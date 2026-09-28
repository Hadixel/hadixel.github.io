// What a post's body and its tags may be.
//
// `postBodySchema` is the vocabulary and it is the panel's former fast-fail that is now the only
// check: a post whose body is not a document is refused here rather than by whichever caller happened
// to remember to look. The node count is checked after the parse rather than before it, because
// "a thousand paragraphs" is a statement about the document and not about a string's length.

import { postBodySchema, seoSchema } from "@kmodern/schema";
import { tagSlug } from "@kmodern/schema/slug";
import { PostRuleException } from "./exceptions/post.exception.js";
import { MAX_BODY_NODES, MAX_TAG_LENGTH } from "./dto/post.dto.js";
import type { Prisma } from "../generated/prisma/client.js";


/** The document shape `postBodySchema` validates to. Named here because the schema exports the value
 *  and not the type. */
export type PostBody = ReturnType<typeof postBodySchema.parse>;

/**
 * The body, judged and bounded.
 *
 * Throws rather than returning a result union, like every other rule here: one mechanism for "no" is
 * one fewer thing for a caller to forget.
 */
export function parseBody(raw: Record<string, unknown>): PostBody {
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw new PostRuleException(`بدنهٔ پست نامعتبر است: ${parsed.error.issues[0]?.message ?? ""}`);
  }
  // After the parse, because it is a statement about the document. A thousand paragraphs is a
  // thousand nodes; the same count of characters is a different thing entirely.
  if (parsed.data.content.length > MAX_BODY_NODES) {
    throw new PostRuleException("تعداد بندهای پست بیش از حد مجاز است");
  }
  return parsed.data;
}

/**
 * The tags, canonicalised and de-duplicated.
 *
 * `blogTagSlug` is the one canonicalisation for a tag's address, so "لوازم خانگی" and "لوازم‌خانگی"
 * are one tag rather than two the reader has to choose between. The panel called the same function —
 * what moved is that the *set* is now a gateway answer rather than something the caller assembles.
 */
export function normaliseTags(raw: string[] | undefined): { name: string; slug: string }[] {
  const seen = new Set<string>();
  const tags: { name: string; slug: string }[] = [];

  for (const entry of raw ?? []) {
    const name = entry.trim();
    if (name === "") continue;
    if (name.length > MAX_TAG_LENGTH) {
      throw new PostRuleException("برچسب‌ها نامعتبر هستند");
    }
    const slug = tagSlug(name);
    // Two spellings of one tag are one tag, and the join table's `@@id([postId, tagId])` would refuse
    // the second — so the duplicate is dropped here, where the name of the tag can still be shown.
    if (seen.has(slug)) continue;
    seen.add(slug);
    tags.push({ name, slug });
  }

  return tags;
}

/** The SEO block, or nothing. `seoSchema` is the shared contract, run here rather than copied. */
export function parsePostSeo(raw: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (raw === undefined) return null;
  if (Object.keys(raw).length === 0) return null;

  const parsed = seoSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PostRuleException(`SEO نامعتبر است: ${parsed.error.issues[0]?.message ?? ""}`);
  }
  return parsed.data as Record<string, unknown>;
}

/**
 * The plaintext the storefront's ILIKE search runs against.
 *
 * Derived here rather than by the caller, and the reason is that it is derived from the *parsed* body:
 * a caller that computed it from the raw input would index whatever it sent, not what was stored.
 *
 * A walk of the document's own text nodes, capped at 2000 characters. The cap is the panel's, and it
 * exists because the column is a plain `String` the search runs `ILIKE` over — a document that grows
 * the index without bound makes every search slower for every post.
 */
export function searchTextFor(body: PostBody): string {
  const parts: string[] = [];

  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes as Array<{ type?: string; text?: string; content?: unknown }>) {
      if (node.text) parts.push(node.text);
      walk(node.content);
    }
  };

  walk(body.content);
  return parts.join(" ").slice(0, 2000);
}

// ---- The panel's list ----
//
// The panel's blog table was a query in a page: a `where` assembled beside a table, an unbounded
// `findMany`, and a set of tags flattened in the JSX. None of that could be given a different meaning
// without editing the page, and none of it was bounded. The predicate is here; the two numbers that
// hold a list to a page are the DTO's, beside the `@Max` that refuses the larger of them.

/**
 * The title search, as the panel's own search box meant it.
 *
 * The title only, and case-insensitively — the panel searched `title` with `contains` and
 * `mode: "insensitive"`, carried over whole rather than tidied. The body is searchable through
 * `searchText`, which is the storefront's index and not the panel's to widen.
 *
 * Exported so a test can state what the predicate matches rather than inferring it from whichever row
 * happened to be found.
 */
export function matchesSearch(q: string): Prisma.PostWhereInput {
  return { title: { contains: q, mode: "insensitive" } };
}

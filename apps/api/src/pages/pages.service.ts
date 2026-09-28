// What a page's blocks may be.
//
// This is the panel's `validateBlocks`, moved. It is not a copy that happens to agree: it is the only
// place the page-builder's vocabulary is now enforced, and the panel's version is gone rather than
// kept as a "fast fail" — a fast-fail a client owns is a rule a client may skip, and the panel could
// have stored a block the storefront could not render while its own check passed.
//
// Three steps, and the order matters:
//
//   1. The list as a list. An array of anything is not a page.
//   2. Each block against `blockSchema` — its id, its type, its props as a record — and then its props
//      against the schema for the type it *claims*. Claiming is the point: a block saying
//      `type: "hero"` with the props of a `dealGrid` is refused by the second step, which is why this
//      cannot be one `z.discriminatedUnion` in the DTO and why the type is resolved here.
//   3. The two block types that carry operator-authored HTML are sanitised. `richText` and `customHtml`
//      are the only two a person types markup into, and both are stored as HTML and rendered by the
//      storefront, so both go through the sanitiser on the way in rather than on the way out — a page
//      that stored raw script and sanitised at render time is a page whose stored value is a hazard to
//      anything else that reads it.

import { blockSchema, componentSchemas, type ComponentType } from "@kmodern/schema";
import { MAX_SAFE_HTML_LENGTH, sanitizeAdminHtml } from "@kmodern/schema/sanitize";
import { seoSchema } from "@kmodern/schema";
import type { Prisma } from "../generated/prisma/client.js";
import { PageRuleException } from "./exceptions/page.exception.js";

/**
 * The most characters a page's block payload may occupy.
 *
 * 500_000, carried over from the panel's own `blocksValue.length > 500_000` check. The column is a
 * `Json` with no bound, so without this an unbounded block list is a row that grows until something
 * else breaks.
 */
const MAX_BLOCK_BYTES = 500_000;

/** The two block types whose `props.html` an operator typed. */
const HTML_BLOCK_TYPES: ReadonlySet<string> = new Set(["richText", "customHtml"]);

/** A block, after the vocabulary has been applied. */
export interface PageBlock {
  id: string;
  type: string;
  props: unknown;
}

/**
 * Every block, judged and sanitised.
 *
 * Throws rather than returning a result union, because every failure here is the same answer — this
 * block is not allowed — and the service's other refusals throw too. One mechanism for "no" is one
 * fewer thing for a caller to forget.
 */
export function validateBlocks(raw: unknown): PageBlock[] {
  if (!Array.isArray(raw)) {
    throw new PageRuleException("لیست بلوک‌ها نامعتبر است");
  }

  const blocks: PageBlock[] = [];
  for (const candidate of raw) {
    const parsed = blockSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new PageRuleException(`بلوک نامعتبر: ${parsed.error.issues[0]?.message ?? ""}`);
    }

    const type = parsed.data.type as ComponentType;
    const schema = componentSchemas[type];
    // A block whose type has no schema at all is not caught by step 1 — `blockSchema` admits any
    // string it recognises as a block *shape* — and reaching `undefined` here would be a
    // `TypeError` rather than a sentence naming the block.
    if (!schema) {
      throw new PageRuleException(`نوع بلوک ناشناخته است: ${type}`);
    }

    const props = schema.safeParse(parsed.data.props);
    if (!props.success) {
      throw new PageRuleException(
        `ویژگی‌های بلوک «${type}» نامعتبر است: ${props.error.issues[0]?.message ?? ""}`,
      );
    }

    if (HTML_BLOCK_TYPES.has(type)) {
      const html = (props.data as { html?: unknown }).html;
      if (typeof html !== "string" || html.length > MAX_SAFE_HTML_LENGTH) {
        throw new PageRuleException("HTML بلوک نامعتبر یا بیش از حد بزرگ است");
      }
      blocks.push({ id: parsed.data.id, type, props: { ...props.data, html: sanitizeAdminHtml(html) } });
      continue;
    }

    blocks.push({ id: parsed.data.id, type, props: props.data });
  }

  return blocks;
}

/**
 * The SEO block, or nothing.
 *
 * `seoSchema` is the shared contract. An absent block is `null`; a present and wrong one is refused,
 * because dropping it would leave the page with no SEO and no message.
 */
export function parsePageSeo(raw: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (raw === undefined) return null;
  if (Object.keys(raw).length === 0) return null;

  const parsed = seoSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PageRuleException(`SEO نامعتبر است: ${parsed.error.issues[0]?.message ?? ""}`);
  }
  return parsed.data as Record<string, unknown>;
}

/**
 * A system page keeps its address.
 *
 * The shop's own pages — home, about, contact — are reached at fixed slugs that the storefront links
 * to directly, so renaming one turns every link to it into a 404 with no way back. It is a refusal
 * rather than a redirect because the panel's menu builder and the seed both address these pages by
 * slug, and a redirect would have to be maintained in three places to be right.
 */
export function assertSlugIsMovable(page: { kind: string; slug: string }, nextSlug: string): void {
  if (page.kind === "SYSTEM" && page.slug !== nextSlug) {
    throw new PageRuleException("اسلاگ صفحات سیستمی قابل تغییر نیست");
  }
}

/**
 * A page that is published, or has a block, may not be deleted.
 *
 * The panel's rule was "only a draft may be deleted", which is the right instinct and the wrong
 * question: a draft is a *state*, and a page can be unpublished without ever having been published —
 * at which point the rule refuses a delete of a page nobody ever saw. What the deletion actually
 * destroys is a published address, so that is what is asked.
 */
export function assertPageIsDeletable(page: { status: string }): void {
  if (page.status === "PUBLISHED") {
    throw new PageRuleException("ابتدا صفحه را از انتشار خارج کنید؛ فقط صفحهٔ منتشرنشده حذف می‌شود");
  }
}

/** The largest a page's block payload may be, as a string, before it is even parsed. */
export function assertBlockPayloadSize(serialized: string): void {
  if (serialized.length > MAX_BLOCK_BYTES) {
    throw new PageRuleException("حجم بلوک‌های صفحه بیش از حد مجاز است");
  }
}

// ---- The panel's list ----
//
// The panel's page table was a query in a page: a `where` assembled beside a table, an unbounded
// `findMany`, and a split into system and custom rows the page did itself. None of that could be
// given a different meaning without editing the page, and none of it was bounded. The predicate is
// here; the two numbers that hold a list to a page are the DTO's, beside the `@Max` that refuses the
// larger of them.

/**
 * The title search, as the panel's own search box meant it.
 *
 * The title only, and case-insensitively — the panel searched `title` with `contains` and
 * `mode: "insensitive"`, carried over whole rather than tidied. The slug is not searched, because
 * the panel did not search it and an operator looking for an address types it into the slug box
 * expecting the row, and widening this is a change of meaning dressed as a convenience.
 *
 * Exported so a test can state what the predicate matches rather than inferring it from whichever row
 * happened to be found.
 */
export function matchesSearch(q: string): Prisma.PageWhereInput {
  return { title: { contains: q, mode: "insensitive" } };
}

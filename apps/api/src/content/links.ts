import type { LinkRef } from "@kmodern/contracts";
import type { createPrismaClient } from "../prisma/index.js";
import type { ResolvedLink } from "./dto/home.dto.js";

type Db = ReturnType<typeof createPrismaClient>;

/**
 * Link resolution, moved out of the storefront.
 *
 * A `LinkRef` is a target id until something turns it into an href, and turning it into an href
 * means reading the database. The storefront used to do that inside a component, which meant a
 * rendered CMS block held an open data connection. The gateway owns it now, so a client receives a
 * finished `href` and never learns a slug.
 *
 * This is a move, not a second implementation: the shapes below are the ones
 * `apps/store/src/lib/nav.ts` resolves today, and that module keeps its own copy until ticket 11
 * moves the navigation menu onto the same path. Two copies of this mapping existing briefly is a
 * known deviation from §15.1, called out here rather than left to be discovered.
 */
export function normalizeLinkRef(
  ref: LinkRef | undefined | null,
): LinkRef | undefined | null {
  if (!ref || typeof ref !== "object") return ref;
  const legacy = ref as unknown as {
    type?: unknown;
    value?: unknown;
    targetId?: unknown;
    url?: unknown;
  };
  if (legacy.value !== undefined && legacy.targetId === undefined && legacy.url === undefined) {
    if (legacy.type === "EXTERNAL") {
      return { type: "EXTERNAL", url: String(legacy.value), newTab: true };
    }
    if (
      legacy.type === "PAGE" ||
      legacy.type === "CATEGORY" ||
      legacy.type === "COLLECTION" ||
      legacy.type === "BLOG_POST"
    ) {
      return { type: legacy.type, targetId: String(legacy.value) } as LinkRef;
    }
  }
  return ref;
}

/** The four ref kinds whose href is a slug that has to be read. */
type SlugKind = "CATEGORY" | "PAGE" | "BLOG_POST" | "COLLECTION";

function slugKindOf(ref: LinkRef): { kind: SlugKind; id: string } | null {
  switch (ref.type) {
    case "CATEGORY":
    case "PAGE":
    case "COLLECTION":
    case "BLOG_POST":
      return { kind: ref.type, id: ref.targetId };
    default:
      return null;
  }
}

/** The href prefix a resolved slug is served under. */
function hrefForSlug(kind: SlugKind, slug: string | undefined): string {
  switch (kind) {
    case "CATEGORY":
      return slug ? `/category/${slug}` : "/";
    case "COLLECTION":
      return slug ? `/collection/${slug}` : "/";
    case "BLOG_POST":
      return slug ? `/blog/${slug}` : "/blog";
    case "PAGE":
      return slug ? `/${slug}` : "/";
  }
}

/**
 * Resolve a batch of refs with a bounded number of queries.
 *
 * One `findUnique` per ref would make a page with a dozen linked banners a dozen round trips
 * inside the gateway — the same N+1 the single-read response shape exists to avoid, just moved to
 * the other side of the wire. So the slugs for all four kinds are read in at most four queries, no
 * matter how many refs the batch holds.
 *
 * Returns one entry per input, positionally, so the caller can zip it against a block's banners.
 */
export async function resolveLinks(
  db: Db,
  refs: (LinkRef | undefined | null)[],
): Promise<(ResolvedLink | null)[]> {
  const normalized = refs.map(normalizeLinkRef);

  const byKind = new Map<SlugKind, Set<string>>();
  for (const ref of normalized) {
    if (!ref) continue;
    const target = slugKindOf(ref);
    if (!target) continue;
    const ids = byKind.get(target.kind) ?? new Set<string>();
    ids.add(target.id);
    byKind.set(target.kind, ids);
  }

  const slugs = new Map<string, string>();
  await Promise.all(
    [...byKind].map(async ([kind, ids]) => {
      const rows =
        kind === "CATEGORY"
          ? await db.category.findMany({ where: { id: { in: [...ids] } }, select: { id: true, slug: true } })
          : kind === "COLLECTION"
            ? await db.collection.findMany({ where: { id: { in: [...ids] } }, select: { id: true, slug: true } })
            : kind === "PAGE"
              ? await db.page.findMany({ where: { id: { in: [...ids] } }, select: { id: true, slug: true } })
              : await db.post.findMany({ where: { id: { in: [...ids] } }, select: { id: true, slug: true } });
      for (const row of rows) slugs.set(`${kind}:${row.id}`, row.slug);
    }),
  );

  return normalized.map((ref) => {
    if (!ref) return null;
    switch (ref.type) {
      case "EXTERNAL":
        return { href: ref.url, newTab: ref.newTab };
      case "BLOG_INDEX":
        return { href: "/blog", newTab: false };
      case "NONE":
        return { href: "#", newTab: false };
      case "CATEGORY":
      case "PAGE":
      case "COLLECTION":
      case "BLOG_POST":
        return { href: hrefForSlug(ref.type, slugs.get(`${ref.type}:${ref.targetId}`)), newTab: false };
      default:
        return { href: "/", newTab: false };
    }
  });
}

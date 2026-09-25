import { db, type $Enums } from "@kmodern/db";
import type { LinkRef } from "@kmodern/schema";

// 006 nav: menu trees stored in DB (MenuItem + MenuPromo), rendered by
// location. LinkRef targets resolved to storefront hrefs.

async function dbCat(id: string) {
  return db().category.findUnique({ where: { id }, select: { slug: true } });
}
async function dbPage(id: string) {
  return db().page.findUnique({ where: { id }, select: { slug: true } });
}
async function dbPost(id: string) {
  return db().post.findUnique({ where: { id }, select: { slug: true } });
}
async function dbCollection(id: string) {
  return db().collection.findUnique({ where: { id }, select: { slug: true } });
}

function normalizeLinkRef(ref: LinkRef | undefined | null): LinkRef | undefined | null {
  if (!ref || typeof ref !== "object") return ref;
  const legacy = ref as unknown as { type?: unknown; value?: unknown; targetId?: unknown; url?: unknown };
  if (legacy.value !== undefined && legacy.targetId === undefined && legacy.url === undefined) {
    if (legacy.type === "EXTERNAL") return { type: "EXTERNAL", url: String(legacy.value), newTab: true };
    if (legacy.type === "PAGE" || legacy.type === "CATEGORY" || legacy.type === "COLLECTION" || legacy.type === "BLOG_POST") {
      return { type: legacy.type, targetId: String(legacy.value) } as LinkRef;
    }
  }
  return ref;
}

export async function hrefFor(ref: LinkRef | undefined | null): Promise<{ href: string; newTab: boolean }> {
  const normalized = normalizeLinkRef(ref);
  if (!normalized) return { href: "#", newTab: false };
  switch (normalized.type) {
    case "EXTERNAL":
      return { href: normalized.url, newTab: normalized.newTab };
    case "BLOG_INDEX":
      return { href: "/blog", newTab: false };
    case "CATEGORY": {
      const c = await dbCat(normalized.targetId);
      return { href: c?.slug ? `/category/${c.slug}` : "/", newTab: false };
    }
    case "PAGE": {
      const p = await dbPage(normalized.targetId);
      return { href: p?.slug ? `/${p.slug}` : "/", newTab: false };
    }
    case "BLOG_POST": {
      const p = await dbPost(normalized.targetId);
      return { href: p?.slug ? `/blog/${p.slug}` : "/blog", newTab: false };
    }
    case "COLLECTION": {
      const c = await dbCollection(normalized.targetId);
      return { href: c?.slug ? `/collection/${c.slug}` : "/", newTab: false };
    }
    case "NONE":
      return { href: "#", newTab: false };
    default:
      return { href: "/", newTab: false };
  }
}

export interface NavNode {
  id: string;
  label: string;
  href: string;
  newTab: boolean;
  display: $Enums.MenuDisplay;
  children: NavNode[];
  promos: Array<{ imageUrl: string; alt: string; href: string; newTab: boolean; heading?: string; subtext?: string }>;
}

export interface NavMenu {
  location: $Enums.MenuLocation;
  name: string;
  tree: NavNode[];
}

export async function getNavMenu(location: $Enums.MenuLocation): Promise<NavMenu | null> {
  const menu = await db().menu.findUnique({
    where: { location },
    include: {
      items: {
        where: { visible: true },
        include: { children: { where: { visible: true }, orderBy: { sortOrder: "asc" } }, promos: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!menu) return null;

  type Top = (typeof menu.items)[number];

  async function promo(p: Top["promos"][number]) {
    const { href, newTab } = await hrefFor(p.link as LinkRef | undefined);
    return {
      imageUrl: p.imageUrl,
      alt: p.alt,
      href,
      newTab,
      heading: p.heading ?? undefined,
      subtext: p.subtext ?? undefined,
    };
  }

  async function leaf(i: Top["children"][number]): Promise<NavNode> {
    const { href, newTab } = await hrefFor(i.target as LinkRef | undefined);
    return {
      id: i.id,
      label: i.label,
      href,
      newTab,
      display: i.display,
      children: [],
      promos: [],
    };
  }

  async function branch(i: Top): Promise<NavNode> {
    const { href, newTab } = await hrefFor(i.target as LinkRef | undefined);
    return {
      id: i.id,
      label: i.label,
      href,
      newTab,
      display: i.display,
      children: await Promise.all(i.children.map(leaf)),
      promos: await Promise.all(i.promos.map(promo)),
    };
  }
  return {
    location: menu.location,
    name: menu.name,
    tree: await Promise.all(menu.items.filter((i) => !i.parentId).map(branch)),
  };
}
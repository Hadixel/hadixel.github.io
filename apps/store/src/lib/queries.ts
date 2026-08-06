import { db } from "@kmodern/db";

// Catalog query helpers shared by storefront pages.

export async function getCategoryTree() {
  const cats = await db().category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const roots = cats.filter((c) => !c.parentId);
  return {
    roots: roots.map((r) => ({
      ...r,
      children: cats.filter((c) => c.parentId === r.id).map((c) => ({ ...c, children: [] })),
    })),
    all: cats,
  };
}

export async function getPublishedProducts(opts?: {
  categoryId?: string;
  collectionId?: string;
  search?: string;
  limit?: number;
  sort?: "newest" | "price_asc" | "price_desc";
}) {
  const where = {
    status: "PUBLISHED" as const,
    ...(opts?.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts?.collectionId
      ? { collectionItems: { some: { collectionId: opts.collectionId } } }
      : {}),
    ...(opts?.search
      ? { OR: [
          { name: { contains: opts.search, mode: "insensitive" as const } },
          { brand: { contains: opts.search, mode: "insensitive" as const } },
          { model: { contains: opts.search, mode: "insensitive" as const } },
        ] }
      : {}),
  };
  const orderBy = [{ createdAt: "desc" as const }];

  const products = await db().product.findMany({
    where,
    include: {
      category: true,
      variants: {
        where: { OR: [{ stock: { gt: 0 } }, { allowBackorder: true }] },
        orderBy: { price: "asc" },
      },
    },
    take: opts?.limit ?? 48,
  });
  let mapped = products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    model: p.model,
    category: p.category,
    price: Math.min(...p.variants.map((v) => v.price)),
    maxPrice: Math.max(...p.variants.map((v) => v.price)),
    available: p.variants.length > 0,
    image: p.variants[0]?.images?.[0] ?? null,
    variantCount: p.variants.length,
  }));
  if (opts?.sort === "price_asc") mapped = mapped.sort((a, b) => a.price - b.price);
  if (opts?.sort === "price_desc") mapped = mapped.sort((a, b) => b.price - a.price);
  return mapped;
}

export async function getProductBySlug(slug: string) {
  return db().product.findUnique({
    where: { slug },
    include: {
      category: { include: { specFields: true } },
      variants: { orderBy: [{ colorName: "asc" }, { price: "asc" }] },
      specValues: { include: { specField: true } },
      collectionItems: { include: { collection: true } },
    },
  });
}

export async function getCollections() {
  return db().collection.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        include: { product: { include: { variants: true } } },
        orderBy: { sortOrder: "asc" },
        take: 8,
      },
    },
  });
}

export async function getPublishedPost(slug: string) {
  return db().post.findUnique({
    where: { slug, status: "PUBLISHED" },
    include: { tags: { include: { tag: true } } },
  });
}

export async function getPublishedPosts(limit = 12) {
  return db().post.findMany({
    where: { status: "PUBLISHED" },
    include: { tags: { include: { tag: true } } },
    orderBy: { publishAt: { sort: "desc", nulls: "last" } },
    take: limit,
  });
}

export async function getPublishedPage(slug: string) {
  return db().page.findUnique({
    where: { slug, status: "PUBLISHED" },
  });
}

export async function getSettingsMap() {
  const rows = await db().setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
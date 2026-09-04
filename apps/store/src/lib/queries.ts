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
  sort?: "newest" | "price-asc" | "price-desc";
}) {
  // category filter covers the whole (2-level) subtree
  let categoryIds: string[] | undefined;
  if (opts?.categoryId) {
    const children = await db().category.findMany({
      where: { parentId: opts.categoryId },
      select: { id: true },
    });
    categoryIds = [opts.categoryId, ...children.map((c) => c.id)];
  }

  const where = {
    status: "PUBLISHED" as const,
    ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
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

  // Prisma cannot order by an aggregate over a relation (min variants.price);
  // for price sorts fetch a wider createdAt-ordered window and sort in memory.
  const priceSort = opts?.sort === "price-asc" || opts?.sort === "price-desc";
  const take = priceSort ? Math.max(opts?.limit ?? 48, 200) : (opts?.limit ?? 48);

  const products = await db().product.findMany({
    where,
    orderBy,
    include: {
      category: true,
      variants: {
        where: { OR: [{ stock: { gt: 0 } }, { allowBackorder: true }] },
        orderBy: { price: "asc" },
      },
    },
    take,
  });
  const mapped = products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    model: p.model,
    category: p.category,
    price: p.variants.length ? Math.min(...p.variants.map((v) => v.price)) : 0,
    maxPrice: p.variants.length ? Math.max(...p.variants.map((v) => v.price)) : 0,
    available: p.variants.length > 0,
    image: p.variants[0]?.images?.[0] ?? null,
    variantCount: p.variants.length,
    // Color dots (CONTEXT.md): per-variant color + imagery for card-level swap
    dots: p.variants.map((v) => ({
      id: v.id,
      colorName: v.colorName,
      colorCode: v.colorCode,
      images: v.images,
      price: v.price,
    })),
  }));
  if (opts?.sort === "price-asc") mapped.sort((a, b) => a.price - b.price);
  if (opts?.sort === "price-desc") mapped.sort((a, b) => b.price - a.price);
  return priceSort && opts?.limit ? mapped.slice(0, opts.limit) : mapped;
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
import type { MetadataRoute } from "next";
import { db } from "@kmodern/db";

// 014 SEO: sitemap.xml over products (published), categories, pages, blog.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://kmodern.ir";
  const [products, categories, pages, posts, collections] = await Promise.all([
    db().product.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
    db().category.findMany({ select: { slug: true } }),
    db().page.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
    db().post.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
    db().collection.findMany({ select: { slug: true } }),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/products`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/blog`, changeFrequency: "weekly", priority: 0.6 },
  ];

  return [
    ...staticRoutes,
    ...products.map((p) => ({ url: `${base}/product/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...categories.map((c) => ({ url: `${base}/category/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...collections.map((c) => ({ url: `${base}/collection/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...pages.map((p) => ({ url: `${base}/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "monthly" as const, priority: 0.4 })),
    ...posts.map((p) => ({ url: `${base}/blog/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
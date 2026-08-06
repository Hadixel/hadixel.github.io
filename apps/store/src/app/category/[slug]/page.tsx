import { notFound } from "next/navigation";
import { db } from "@kmodern/db";
import { getPublishedProducts, getCategoryTree } from "@/lib/queries";
import { ProductGrid } from "@/components/product-grid";
import { CategorySidebar } from "@/components/category-sidebar";

export const dynamic = "force-dynamic";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await db().category.findUnique({ where: { slug } });
  if (!category) notFound();

  const { all } = await getCategoryTree();
  const childIds = all.filter((c) => c.parentId === category.id).map((c) => c.id);
  // include products of child categories too (011: category page = tree scope)
  const ids = [category.id, ...childIds];
  const products = await getPublishedProducts({ limit: 60 });
  const scoped = products.filter((p) => p.category && ids.includes(p.category.id));

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[240px_1fr]">
      <CategorySidebar categories={all} />
      <ProductGrid products={scoped} title={category.name} />
    </div>
  );
}
import { getPublishedProducts, getCategoryTree } from "@/lib/queries";
import { ProductGrid } from "@/components/product-grid";
import { CategorySidebar } from "@/components/category-sidebar";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const { all } = await getCategoryTree();
  const products = await getPublishedProducts({ search: sp.q, sort: (sp.sort as never) ?? undefined, limit: 60 });

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[240px_1fr]">
      <CategorySidebar categories={all} />
      <div>
        {sp.q && <p className="mb-4 text-sm text-gray-500">نتایج جستجو برای «{sp.q}»</p>}
        <ProductGrid products={products} title={sp.q ? undefined : "همه محصولات"} />
      </div>
    </div>
  );
}
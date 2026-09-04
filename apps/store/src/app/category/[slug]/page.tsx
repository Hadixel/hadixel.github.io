import { notFound } from "next/navigation";
import { db } from "@kmodern/db";
import { getPublishedProducts, getCategoryTree } from "@/lib/queries";
import { ProductGrid } from "@/components/product-grid";
import { CategorySidebar } from "@/components/category-sidebar";

export const dynamic = "force-dynamic";

const SORTS = [
  { value: "newest", label: "جدیدترین" },
  { value: "price-asc", label: "ارزان‌ترین" },
  { value: "price-desc", label: "گران‌ترین" },
] as const;

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const category = await db().category.findUnique({ where: { slug } });
  if (!category) notFound();

  const { all } = await getCategoryTree();
  // getPublishedProducts expands the filter to the category subtree itself
  const sort = sp.sort === "price-asc" || sp.sort === "price-desc" || sp.sort === "newest"
    ? sp.sort
    : undefined;
  const products = await getPublishedProducts({ categoryId: category.id, sort, limit: 60 });

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 lg:grid-cols-[220px_1fr]">
      <CategorySidebar categories={all} activeSlug={category.slug} />
      <div>
        <div className="mb-8 flex items-end justify-between">
          <h1 className="text-3xl font-black text-ink">{category.name}</h1>
          <form action={`/category/${slug}`} method="GET" className="flex items-center gap-2 text-sm">
            <label htmlFor="sort" className="text-ash">مرتب‌سازی:</label>
            <select
              id="sort"
              name="sort"
              defaultValue={sort ?? "newest"}
              className="h-9 rounded-card border border-fog bg-canvas px-3 text-ink outline-none focus:border-flame-700"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </form>
        </div>
        <ProductGrid products={products} />
      </div>
    </div>
  );
}

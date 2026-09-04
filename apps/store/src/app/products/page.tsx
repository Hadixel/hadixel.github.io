import { getPublishedProducts, getCategoryTree } from "@/lib/queries";
import { ProductGrid } from "@/components/product-grid";
import { CategorySidebar } from "@/components/category-sidebar";

export const dynamic = "force-dynamic";

const SORTS = [
  { value: "newest", label: "جدیدترین" },
  { value: "price-asc", label: "ارزان‌ترین" },
  { value: "price-desc", label: "گران‌ترین" },
] as const;

type SortValue = (typeof SORTS)[number]["value"];

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const { all } = await getCategoryTree();
  const sort: SortValue | undefined = SORTS.some((s) => s.value === sp.sort)
    ? (sp.sort as SortValue)
    : undefined;
  const products = await getPublishedProducts({ search: sp.q, sort, limit: 60 });

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 lg:grid-cols-[220px_1fr]">
      <CategorySidebar categories={all} />
      <div>
        <div className="mb-8 flex items-end justify-between">
          <h1 className="text-3xl font-black text-ink">{sp.q ? `نتایج «${sp.q}»` : "همه محصولات"}</h1>
          <form action="/products" method="GET" className="flex items-center gap-2 text-sm">
            {sp.q && <input type="hidden" name="q" value={sp.q} />}
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

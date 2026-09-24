import { notFound } from "next/navigation";
import { db } from "@kmodern/db";
import { getPublishedProducts, getCategoryTree } from "@/lib/queries";
import { normalizeListingSort, ProductListing } from "@/components/product-listing";

export const dynamic = "force-dynamic";

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
  const sort = normalizeListingSort(sp.sort);
  const products = await getPublishedProducts({ categoryId: category.id, sort, limit: 60 });

  return (
    <ProductListing
      products={products}
      categories={all}
      activeSlug={category.slug}
      title={category.name}
      sort={sort}
      action={`/category/${slug}`}
      description="محصولات این دسته را با جزئیات فنی، رنگ‌های موجود و قیمت مقایسه کنید."
    />
  );
}

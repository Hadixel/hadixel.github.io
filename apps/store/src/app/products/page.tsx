import { getPublishedProducts, getCategoryTree } from "@/lib/queries";
import { normalizeListingSort, ProductListing } from "@/catalogue/components/product-listing";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const { all } = await getCategoryTree();
  const sort = normalizeListingSort(sp.sort);
  const products = await getPublishedProducts({ search: sp.q, sort, limit: 60 });

  return (
    <ProductListing
      products={products}
      categories={all}
      title="همه محصولات"
      query={sp.q}
      sort={sort}
      action="/products"
      mobileViews
      description={sp.q ? "نتایج مرتبط با عبارت جستجوی شما" : "محصولات فروشگاه را بر اساس دسته‌بندی، قیمت یا تازگی بررسی کنید."}
    />
  );
}

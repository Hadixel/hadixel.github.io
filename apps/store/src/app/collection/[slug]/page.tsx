import { notFound } from "next/navigation";
import { db } from "@kmodern/db";
import { getPublishedProducts, getCategoryTree } from "@/lib/queries";
import { normalizeListingSort, ProductListing } from "@/components/product-listing";

export const dynamic = "force-dynamic";

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const collection = await db().collection.findUnique({ where: { slug } });
  if (!collection) notFound();
  const sort = normalizeListingSort(sp.sort);
  const [{ all }, products] = await Promise.all([
    getCategoryTree(),
    getPublishedProducts({ collectionId: collection.id, sort, limit: 60 }),
  ]);

  return (
    <ProductListing
      products={products}
      categories={all}
      title={collection.name}
      sort={sort}
      action={`/collection/${slug}`}
      description="منتخبی از محصولات فروشگاه برای بررسی سریع‌تر."
    />
  );
}

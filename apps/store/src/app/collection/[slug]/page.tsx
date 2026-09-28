import { notFound } from "next/navigation";
import { getPublishedProducts, getCategoryTree } from "@/lib/queries";
import { lookupCollection } from "@/lib/gateway-catalogue";
import { normalizeListingSort, ProductListing } from "@/components/product-listing";

export const dynamic = "force-dynamic";

// A collection's products, and the collection itself.
//
// Kept apart for the reason the category page keeps its three outcomes apart: a slug no collection
// holds is Next's not-found, and a gateway that is not answering is an error rather than a page. A
// collection that answered an outage with an empty grid would read as a shop with nothing in it.
export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const lookup = await lookupCollection(slug);

  if (lookup.kind === "missing") notFound();
  if (lookup.kind === "unavailable") {
    throw new Error(`gateway unavailable while reading collection "${slug}": ${lookup.reason}`);
  }
  const collection = lookup.collection;

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

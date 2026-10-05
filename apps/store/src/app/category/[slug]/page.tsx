import { notFound } from "next/navigation";
import { getPublishedProducts, getCategoryTree } from "@/lib/queries";
import { lookupCategory } from "@/catalogue/lib/gateway-catalogue";
import { normalizeListingSort, ProductListing } from "@/catalogue/components/product-listing";

export const dynamic = "force-dynamic";

// A category's products, and the category itself.
//
// The row is read through the gateway rather than from a database this app does not own, and the
// three outcomes are kept apart: a slug no category holds is Next's not-found, while a gateway that
// is not answering is rethrown for the error boundary. Rendering not-found for an outage would turn
// a five-minute blip into a category page full of dead links that look deliberate, and would look
// exactly like a category with nothing in it.
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const lookup = await lookupCategory(slug);

  if (lookup.kind === "missing") notFound();
  if (lookup.kind === "unavailable") {
    throw new Error(`gateway unavailable while reading category "${slug}": ${lookup.reason}`);
  }
  const category = lookup.category;

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

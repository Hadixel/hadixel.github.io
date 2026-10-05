import { toFaDigits } from "@kmodern/contracts/format";
import type { CatalogueProduct } from "@/catalogue/lib/gateway-catalogue";
import type { CategorySummary } from "@/types";
import { ListingFilterRail, type ListingSort } from "@/catalogue/components/listing-rail";
import { MobileCategoryFilter } from "@/catalogue/components/mobile-category-filter";
import { PageHeader } from "@/components/page-header";
import { ListingMobileViewProvider, ListingMobileViewToggle, ProductGrid } from "@/catalogue/components/product-grid";

export { normalizeListingSort, type ListingSort } from "@/catalogue/components/sort-options";

export function ProductListing({
  products,
  categories,
  activeSlug,
  title,
  description,
  query,
  sort,
  action,
  mobileViews = false,
}: {
  products: CatalogueProduct[];
  categories: CategorySummary[];
  activeSlug?: string;
  title: string;
  description?: string;
  query?: string;
  sort?: ListingSort;
  action: string;
  /* Only the all-products listing offers the mobile one-per-row / two-up switch. */
  mobileViews?: boolean;
}) {
  const listing = (
    <div className="min-w-0">
      <PageHeader
        title={query ? `نتایج «${query}»` : title}
        description={`${description ?? "محصولات را برای مشاهده و مقایسه بررسی کنید."} · ${toFaDigits(products.length)} محصول`}
        actions={mobileViews ? <ListingMobileViewToggle /> : undefined}
      />
      <ProductGrid products={products} ariaLabel={query ? "نتایج جستجو" : title} mobileViews={mobileViews} />
    </div>
  );

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:py-10">
      <div className="mb-5 lg:hidden">
        <MobileCategoryFilter categories={categories} activeSlug={activeSlug} action={action} sort={sort} query={query} />
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <ListingFilterRail categories={categories} activeSlug={activeSlug} action={action} sort={sort} query={query} count={products.length} />
        {mobileViews ? <ListingMobileViewProvider>{listing}</ListingMobileViewProvider> : listing}
      </div>
    </div>
  );
}

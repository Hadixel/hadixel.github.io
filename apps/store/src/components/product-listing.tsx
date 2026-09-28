import { toFaDigits } from "@kmodern/schema/format";
import type { CatalogueProduct, CategorySummary } from "@/lib/gateway-catalogue";
import { CategorySidebar } from "./category-sidebar";
import { MobileCategoryFilter } from "./mobile-category-filter";
import { PageHeader } from "./page-header";
import { ListingMobileViewProvider, ListingMobileViewToggle, ProductGrid } from "./product-grid";
import { ListingSort } from "./listing-sort";

const SORTS = [
  { value: "newest", label: "جدیدترین" },
  { value: "price-asc", label: "ارزان‌ترین" },
  { value: "price-desc", label: "گران‌ترین" },
] as const;

export type ListingSort = (typeof SORTS)[number]["value"];

export function normalizeListingSort(value?: string): ListingSort | undefined {
  return SORTS.some((sort) => sort.value === value) ? (value as ListingSort) : undefined;
}

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
        actions={
          <>
            <ListingSort action={action} sort={sort} query={query} />
            {mobileViews && <ListingMobileViewToggle />}
          </>
        }
      />
      <ProductGrid products={products} ariaLabel={query ? "نتایج جستجو" : title} mobileViews={mobileViews} />
    </div>
  );

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:py-10">
      <div className="mb-5 lg:hidden">
        <MobileCategoryFilter categories={categories} activeSlug={activeSlug} />
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <CategorySidebar categories={categories} activeSlug={activeSlug} />
        {mobileViews ? <ListingMobileViewProvider>{listing}</ListingMobileViewProvider> : listing}
      </div>
    </div>
  );
}

import Link from "next/link";
import { toFaDigits } from "@kmodern/contracts/format";

import type { CatalogueProduct } from "@/catalogue/lib/gateway-catalogue";
import type { CategorySummary } from "@/types";

import { cn } from "@kmodern/ui";

import { type ListingSort } from "@/catalogue/components/sort-options";
import { ListingFilterRail } from "@/catalogue/components/listing-rail";
import { listingPulse } from "@/catalogue/components/listing-pulse";
import { MobileCategoryFilter } from "@/catalogue/components/mobile-category-filter";
import {
  ListingMobileViewProvider,
  ListingMobileViewToggle,
  ProductGrid,
} from "@/catalogue/components/product-grid";
import { PageHeader } from "@/components/page-header";

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
  mobileViews?: boolean;
}) {
  const pulse = listingPulse({
    count: products.length,
    categories,
    activeSlug,
    query,
    sort,
    action,
  });

  const listing = (
    <div className="min-w-0">
      <PageHeader
        title={query ? `نتایج «${query}»` : title}
        description={description ?? "محصولات را برای مشاهده و مقایسه بررسی کنید."}
        actions={mobileViews ? <ListingMobileViewToggle /> : undefined}
      />
      <ProductGrid
        products={products}
        ariaLabel={query ? "نتایج جستجو" : title}
        mobileViews={mobileViews}
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:py-10">
      <div className="mb-5 lg:hidden">
        <MobileCategoryFilter
          categories={categories}
          activeSlug={activeSlug}
          action={action}
          sort={sort}
          query={query}
        />
      </div>

      <div className="mb-6 flex flex-col gap-3 rounded-card border border-plaster bg-canvas/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-micro font-bold text-ash">
            <span aria-hidden className="size-1.5 rounded-pill bg-flame-600" />
            {toFaDigits(pulse.count)} محصول
          </span>
          {pulse.chips.map((chip) => (
            <Link
              key={chip.key}
              href={chip.href}
              className="inline-flex items-center gap-1 rounded-pill border border-fog bg-canvas px-3 py-1 text-xs font-semibold text-ink transition-[color,border-color,transform,scale] hover:border-flame-300 hover:text-flame-700 active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame-700"
            >
              <span className="text-ash" aria-hidden>
                ✕
              </span>
              {chip.label}
            </Link>
          ))}
        </div>
        <span className="inline-flex flex-wrap items-center gap-1 rounded-pill border border-plaster bg-canvas p-1 sm:ms-auto">
          {pulse.sorts.map((s) => (
            <Link
              key={s.value}
              href={s.href}
              className={cn(
                "rounded-pill px-3 py-1 text-xs font-semibold transition-[color,background-color,transform,scale] active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame-700",
                s.active ? "bg-flame-700 text-white" : "text-ash hover:bg-plaster hover:text-ink",
              )}
            >
              {s.label}
            </Link>
          ))}
        </span>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
        <ListingFilterRail
          categories={categories}
          activeSlug={activeSlug}
          action={action}
          sort={sort}
          query={query}
          count={products.length}
        />
        {mobileViews ? <ListingMobileViewProvider>{listing}</ListingMobileViewProvider> : listing}
      </div>
    </div>
  );
}

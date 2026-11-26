import Link from "next/link";
import { toFaDigits } from "@kmodern/contracts/format";

import type { CatalogueProduct } from "@/catalogue/lib/gateway-catalogue";
import type { CategorySummary } from "@/types";

import { cn } from "@kmodern/ui";

import { type ListingSort } from "@/catalogue/components/sort-options";
import { ListingFilterRail } from "@/catalogue/components/listing-rail";
import { listingPulse } from "@/catalogue/components/listing-pulse";
import { MobileFilterBar } from "@/catalogue/components/mobile-filter-bar";
import {
  ListingMobileViewProvider,
  ListingMobileViewToggle,
  ProductGrid,
} from "@/catalogue/components/product-grid";

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
  mobileViews = true,
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

  const content = (
    <div className="mx-auto w-full max-w-[1600px] px-3.5 py-4 sm:px-4 sm:py-10">
      {/* 
        1. Title & description at the very top, with the mobile view toggle
        (Single Row vs 2-Col Grid) aligned at the start on mobile.
      */}
      <div className="mb-3.5 flex items-center justify-between gap-2.5 sm:mb-6">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-black text-ink sm:text-2xl md:text-3xl">
            {query ? `نتایج «${query}»` : title}
          </h1>
          {description && (
            <p className="mt-1 hidden text-xs text-ash sm:block">{description}</p>
          )}
        </div>
        {mobileViews && <ListingMobileViewToggle />}
      </div>

      {/* 
        2. Mobile filter & sort bar:
        - Compact and directly under title on mobile so products are visible first.
        - Compacts into a narrow horizontal sticky line on scroll down.
      */}
      <MobileFilterBar
        categories={categories}
        activeSlug={activeSlug}
        action={action}
        sort={sort}
        query={query}
        count={pulse.count}
        sorts={pulse.sorts}
      />

      {/* 
        3. Desktop count, active filter chips & sort bar (hidden below lg)
      */}
      <div className="mb-6 hidden flex-col gap-3 rounded-card border border-flame-100 bg-flame-50/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 lg:flex">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-micro font-bold text-flame-800">
            <span aria-hidden className="size-1.5 rounded-pill bg-flame-600" />
            {toFaDigits(pulse.count)} محصول
          </span>
          {pulse.chips.map((chip) => (
            <Link
              key={chip.key}
              href={chip.href}
              className="inline-flex items-center gap-1 rounded-pill border border-flame-200 bg-flame-50 px-3 py-1 text-xs font-semibold text-flame-700 transition-[color,border-color,background-color,transform,scale] hover:border-flame-400 hover:bg-flame-100 active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame-700"
            >
              <span className="text-flame-500" aria-hidden>
                ✕
              </span>
              {chip.label}
            </Link>
          ))}
        </div>
        <span className="inline-flex flex-wrap items-center gap-1 rounded-pill border border-flame-100 bg-canvas p-1 sm:ms-auto">
          {pulse.sorts.map((s) => (
            <Link
              key={s.value}
              href={s.href}
              className={cn(
                "rounded-pill px-3 py-1 text-xs font-semibold transition-[color,background-color,transform,scale] active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame-700",
                s.active ? "bg-flame-50 text-flame-700 ring-1 ring-flame-200" : "text-ash hover:bg-flame-50/60 hover:text-flame-700",
              )}
            >
              {s.label}
            </Link>
          ))}
        </span>
      </div>

      {/* 
        4. Main catalogue area: desktop sidebar on the right, product grid/list
      */}
      <div className="grid items-start gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
        <ListingFilterRail
          categories={categories}
          activeSlug={activeSlug}
          action={action}
          sort={sort}
          query={query}
          count={products.length}
        />
        <div className="min-w-0">
          <ProductGrid
            products={products}
            ariaLabel={query ? "نتایج جستجو" : title}
            mobileViews={mobileViews}
          />
        </div>
      </div>
    </div>
  );

  return mobileViews ? (
    <ListingMobileViewProvider>{content}</ListingMobileViewProvider>
  ) : (
    content
  );
}

"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@kmodern/ui";
import { RankNumeral } from "@kmodern/ui";
import type { PublishedProduct } from "@/lib/queries";
import { EmptyState } from "@/components/empty-state";
import { ShowcaseCard } from "@/home/components/showcase-card";
import { ShowcaseRowCard } from "@/home/components/showcase-row-card";

export function ProductCard({
  product,
  imageSizes,
  priority = false,
  quality = 65,
}: {
  product: PublishedProduct;
  imageSizes?: string;
  priority?: boolean;
  quality?: number;
}) {
  return (
    <ShowcaseCard
      href={`/product/${product.slug}`}
      name={product.name}
      model={product.model}
      price={product.price}
      maxPrice={product.maxPrice}
      available={product.available}
      variants={product.dots}
      discount={product.discount}
      imageSizes={imageSizes}
      priority={priority}
      quality={quality}
    />
  );
}

/* ---------- Mobile view modes (opt-in; single row or two-up grid) ---------- */

export type MobileViewMode = "row" | "grid";

const VIEW_STORAGE_KEY = "kmodern:listing-mobile-view";

const MobileViewContext = createContext<{
  mode: MobileViewMode;
  setMode: (mode: MobileViewMode) => void;
} | null>(null);

export function ListingMobileViewProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<MobileViewMode>("row");

  /* sessionStorage is client-only, so it is read after mount: the server HTML and
     the first client render both start on the row view instead of mismatching. */
  useEffect(() => {
    const stored = window.sessionStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "grid" || stored === "row") setMode(stored);
    else if (stored === "rail") setMode("row");
  }, []);

  const value = useMemo(
    () => ({
      mode,
      setMode: (next: MobileViewMode) => {
        setMode(next);
        try {
          window.sessionStorage.setItem(VIEW_STORAGE_KEY, next);
        } catch {
          /* storage blocked: the choice still holds for the current page */
        }
      },
    }),
    [mode],
  );

  return <MobileViewContext value={value}>{children}</MobileViewContext>;
}

export function ListingMobileViewToggle() {
  const view = useContext(MobileViewContext);
  if (!view) return null;

  return (
    <div
      role="group"
      aria-label="نوع نمایش محصولات"
      dir="ltr"
      className="inline-flex shrink-0 items-center rounded-2xl border border-flame-200/70 bg-canvas p-1 shadow-2xs sm:hidden"
    >
      <button
        type="button"
        aria-pressed={view.mode === "row"}
        aria-label="نمایش ردیفی (تکی)"
        title="نمایش ردیفی"
        onClick={() => view.setMode("row")}
        className={cn(
          "flex h-8 w-10 items-center justify-center rounded-xl transition-all",
          view.mode === "row"
            ? "bg-flame-600 text-white shadow-xs"
            : "text-ash hover:text-flame-700",
        )}
      >
        {/* Horizontal single row rectangle matching Image 3 */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="3.5" y="6.5" width="17" height="11" rx="3.5" />
        </svg>
      </button>

      <button
        type="button"
        aria-pressed={view.mode === "grid"}
        aria-label="نمایش شبکه‌ای (دوتایی)"
        title="نمایش شبکه‌ای"
        onClick={() => view.setMode("grid")}
        className={cn(
          "flex h-8 w-10 items-center justify-center rounded-xl transition-all",
          view.mode === "grid"
            ? "bg-flame-600 text-white shadow-xs"
            : "text-ash hover:text-flame-700",
        )}
      >
        {/* Two vertical rectangles matching Image 3 */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="4.5" y="5.5" width="6" height="13" rx="2" />
          <rect x="13.5" y="5.5" width="6" height="13" rx="2" />
        </svg>
      </button>
    </div>
  );
}

export function ProductGrid({
  products,
  title,
  titleLevel = "h2",
  className,
  ariaLabel,
  mobileViews = false,
}: {
  products: PublishedProduct[];
  title?: string;
  titleLevel?: "h1" | "h2";
  className?: string;
  ariaLabel?: string;
  mobileViews?: boolean;
}) {
  const view = useContext(MobileViewContext);
  if (products.length === 0) {
    return (
      <EmptyState
        title="محصولی پیدا نشد"
        description="فیلترها یا عبارت جستجو را تغییر دهید و دوباره بررسی کنید."
        action={{ label: "مشاهده همه محصولات", href: "/products" }}
        compact
      />
    );
  }

  const Heading = titleLevel;
  const isRowMode = mobileViews && (!view || view.mode === "row");

  return (
    <section className={cn("w-full", className)} aria-label={ariaLabel ?? title ?? "محصولات"}>
      {title && (
        <Heading className="mb-7 font-display text-2xl font-extrabold text-ink sm:text-3xl">
          {title}
        </Heading>
      )}

      {/* Mobile rendering: Single Row view (Image 1) or 2-up Grid */}
      {mobileViews && (
        <div className="sm:hidden">
          {isRowMode ? (
            <div className="flex flex-col">
              {products.map((product, index) => (
                <ShowcaseRowCard
                  key={product.id}
                  href={`/product/${product.slug}`}
                  name={product.name}
                  model={product.model}
                  price={product.price}
                  maxPrice={product.maxPrice}
                  available={product.available}
                  variants={product.dots}
                  discount={product.discount}
                  priority={index < 4}
                  quality={65}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 items-stretch gap-3">
              {products.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  priority={index < 4}
                  quality={65}
                  imageSizes="(max-width:640px) 50vw, 25vw"
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Desktop / Tablet rendering (sm and up) */}
      <div
        className={cn(
          "grid-cols-2 items-stretch gap-4 sm:grid lg:grid-cols-3 xl:grid-cols-4",
          mobileViews ? "hidden sm:grid" : "grid",
        )}
      >
        {products.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            priority={index < 4}
            quality={65}
            imageSizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ))}
      </div>
    </section>
  );
}

export function RankedProductCard({ product, rank }: { product: PublishedProduct; rank: number }) {
  return (
    <div className="relative">
      <ProductCard product={product} />
      <RankNumeral rank={rank} />
    </div>
  );
}

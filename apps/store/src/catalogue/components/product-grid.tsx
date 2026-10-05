"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@kmodern/ui";
import { RankNumeral } from "@kmodern/ui";
import type { PublishedProduct } from "@/lib/queries";
import { AnimatedContent } from "@/components/reactbits/index";
import { EmptyState } from "@/components/empty-state";
import { ShowcaseCard } from "@/home/components/showcase-card";

export function ProductCard({
  product,
  imageSizes,
}: {
  product: PublishedProduct;
  imageSizes?: string;
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
    />
  );
}

/* ---------- Mobile view modes (opt-in; the product page and homepage keep one card per row) ---------- */

export type MobileViewMode = "grid" | "rail";

const VIEW_STORAGE_KEY = "kmodern:listing-mobile-view";

const MobileViewContext = createContext<{ mode: MobileViewMode; setMode: (mode: MobileViewMode) => void } | null>(null);

export function ListingMobileViewProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<MobileViewMode>("grid");

  /* sessionStorage is client-only, so it is read after mount: the server HTML and
     the first client render both start on the two-up grid instead of mismatching. */
  useEffect(() => {
    const stored = window.sessionStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "grid" || stored === "rail") setMode(stored);
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

const VIEW_OPTIONS = [
  { mode: "grid", label: "نمایش دوتایی", icon: "two-up" },
  { mode: "rail", label: "نمایش تکی", icon: "one-up" },
] as const;

export function ListingMobileViewToggle() {
  const view = useContext(MobileViewContext);
  if (!view) return null;

  return (
    <div
      role="group"
      aria-label="نوع نمایش محصولات"
      className="flex shrink-0 items-center gap-1 rounded-card border border-fog bg-canvas p-1 sm:hidden"
    >
      {VIEW_OPTIONS.map((option) => {
        const active = view.mode === option.mode;
        return (
          <button
            key={option.mode}
            type="button"
            aria-pressed={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => view.setMode(option.mode)}
            className={cn(
              "flex size-9 items-center justify-center rounded-card transition-colors",
              active ? "bg-flame-700 text-white" : "text-ash hover:bg-plaster hover:text-ink",
            )}
          >
            {option.icon === "two-up" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3.5" y="5" width="7" height="14" rx="2" />
                <rect x="13.5" y="5" width="7" height="14" rx="2" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="6" width="18" height="12" rx="3" />
              </svg>
            )}
          </button>
        );
      })}
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

  /* Both mobile modes fall back to the same 2/3/4 column grid from `sm` up, so
     desktop is identical whichever mode is active. */
  const rail = mobileViews && view?.mode === "rail";
  const containerClass = !mobileViews
    ? "grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    : rail
      ? "flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto overscroll-x-contain scrollbar-none pb-1 [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:pb-0 lg:grid-cols-3 xl:grid-cols-4"
      : "grid grid-cols-2 items-stretch gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4";
  const itemClass = rail ? "h-full w-[84%] shrink-0 snap-start sm:w-auto sm:shrink" : "h-full";
  const imageSizes = !mobileViews
    ? undefined
    : rail
      ? "(max-width:640px) 84vw, (max-width:1024px) 50vw, 25vw"
      : "(max-width:640px) 50vw, (max-width:1024px) 50vw, 25vw";

  return (
    <section className={cn("w-full", className)} aria-label={ariaLabel ?? title ?? "محصولات"}>
      {title && (
        <Heading className="mb-7 font-display text-2xl font-extrabold text-ink sm:text-3xl">
          {title}
        </Heading>
      )}
      <div className={containerClass}>
        {products.map((product, index) => (
          <AnimatedContent key={product.id} delay={Math.min(index, 7) * 45} distance={22} className={itemClass}>
            <ProductCard product={product} imageSizes={imageSizes} />
          </AnimatedContent>
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

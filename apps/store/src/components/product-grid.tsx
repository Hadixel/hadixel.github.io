"use client";

import { cn } from "@kmodern/ui";
import { RankNumeral } from "@kmodern/ui";
import type { PublishedProduct } from "@/lib/queries";
import { AnimatedContent } from "./reactbits";
import { EmptyState } from "./empty-state";
import { ShowcaseCard } from "./showcase-card";

export function ProductCard({ product }: { product: PublishedProduct }) {
  return (
    <ShowcaseCard
      href={`/product/${product.slug}`}
      name={product.name}
      model={product.model}
      price={product.price}
      maxPrice={product.maxPrice}
      available={product.available}
      variants={product.dots}
    />
  );
}

export function ProductGrid({
  products,
  title,
  titleLevel = "h2",
  className,
  ariaLabel,
}: {
  products: PublishedProduct[];
  title?: string;
  titleLevel?: "h1" | "h2";
  className?: string;
  ariaLabel?: string;
}) {
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

  return (
    <section className={cn("w-full", className)} aria-label={ariaLabel ?? title ?? "محصولات"}>
      {title && (
        <Heading className="mb-7 font-display text-2xl font-extrabold text-ink sm:text-3xl">
          {title}
        </Heading>
      )}
      <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((product, index) => (
          <AnimatedContent key={product.id} delay={Math.min(index, 7) * 45} distance={22} className="h-full">
            <ProductCard product={product} />
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

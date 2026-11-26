"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Drawer } from "@heroui/react";
import type { CategorySummary } from "@/types";
import { toFaDigits } from "@kmodern/contracts/format";
import { cn } from "@kmodern/ui";
import { SortFieldset, type ListingSort } from "@/catalogue/components/listing-rail";

export function MobileFilterBar({
  categories,
  activeSlug,
  action,
  sort,
  query,
  count,
  sorts,
}: {
  categories: CategorySummary[];
  activeSlug?: string;
  action: string;
  sort?: ListingSort;
  query?: string;
  count: number;
  sorts: Array<{ label: string; value: string; href: string; active: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const roots = categories.filter((category) => !category.parentId);

  useEffect(() => {
    const handleScroll = () => {
      // Trigger compact mode once scrolled past initial header area
      setScrolled(window.scrollY > 90);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <Drawer isOpen={open} onOpenChange={setOpen}>
      {/* 
        Below `lg` screen width:
        When scrolled down -> sticky, compact single horizontal narrow line under the header.
        When at the top -> expanded 2-tier view matching reference image 2.
      */}
      {scrolled ? (
        <div className="sticky top-[var(--store-header-offset,97px)] z-30 mb-3 -mx-3.5 border-b border-flame-100 bg-canvas/95 px-3.5 py-2 shadow-2xs backdrop-blur-md transition-all lg:hidden">
          <div className="flex items-center justify-between gap-2.5">
            {/* Start (right in RTL): Compact Filter trigger button with icon on the right matching Image 2 */}
            <Drawer.Trigger
              aria-label="فیلتر و مرتب‌سازی"
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-flame-200/80 bg-flame-50/60 px-3 text-xs font-bold text-flame-700 shadow-2xs transition-colors hover:border-flame-300 hover:bg-flame-50"
            >
              <span>فیلتر و مرتب‌سازی</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden
              >
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="8" y1="12" x2="20" y2="12" />
                <line x1="12" y1="17" x2="20" y2="17" />
              </svg>
            </Drawer.Trigger>

            {/* End (left in RTL): Compact count & horizontal sort strip */}
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto no-scrollbar">
              <div className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-flame-800">
                <span className="size-1.5 rounded-full bg-flame-600" aria-hidden />
                <span>{toFaDigits(count)} محصول</span>
              </div>
              <div className="flex items-center gap-0.5 rounded-full border border-flame-100 bg-canvas p-0.5">
                {sorts.map((s) => (
                  <Link
                    key={s.value}
                    href={s.href}
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition-all",
                      s.active
                        ? "bg-flame-50 text-flame-700 ring-1 ring-flame-200"
                        : "text-ash hover:text-flame-700",
                    )}
                  >
                    {s.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-4 space-y-2.5 lg:hidden">
          {/* Top row: Filter & Sort button matching Image 2, aligned to start (right in RTL) */}
          <div className="flex justify-start">
            <Drawer.Trigger
              aria-label="فیلتر و مرتب‌سازی"
              className="flex min-h-10 items-center gap-2 rounded-xl border border-flame-200/80 bg-flame-50/60 px-4 text-xs font-bold text-flame-700 shadow-2xs transition-colors hover:border-flame-300 hover:bg-flame-50"
            >
              <span>فیلتر و مرتب‌سازی</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                aria-hidden
              >
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="8" y1="12" x2="20" y2="12" />
                <line x1="12" y1="17" x2="20" y2="17" />
              </svg>
            </Drawer.Trigger>
          </div>

          {/* Bottom card: Count indicator + Sort pill container matching Image 2 */}
          <div className="rounded-2xl border border-flame-100 bg-flame-50/30 p-3.5 shadow-2xs">
            <div className="mb-2.5 flex items-center justify-start gap-1.5 text-xs font-bold text-flame-800">
              <span className="size-2 rounded-full bg-flame-600" aria-hidden />
              <span>{toFaDigits(count)} محصول</span>
            </div>
            <div className="flex items-center justify-start gap-1 rounded-full border border-flame-100 bg-canvas p-1">
              {sorts.map((s) => (
                <Link
                  key={s.value}
                  href={s.href}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-xs font-bold transition-all",
                    s.active
                      ? "bg-flame-50 text-flame-700 ring-1 ring-flame-200"
                      : "text-ash hover:text-flame-700",
                  )}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filter Drawer Body */}
      <Drawer.Backdrop>
        <Drawer.Content placement="left">
          <Drawer.Dialog>
            <Drawer.Header className="mb-5 flex-row items-center justify-between border-b border-plaster pb-4">
              <Drawer.Heading className="font-display text-lg font-black text-ink">
                فیلتر و دسته‌بندی
              </Drawer.Heading>
              <Drawer.CloseTrigger aria-label="بستن" />
            </Drawer.Header>
            <Drawer.Body>
              <div className="mb-5">
                <SortFieldset action={action} sort={sort} query={query} />
              </div>
              <div className="mb-4 border-t border-plaster" />
              <nav className="space-y-4">
                <Link
                  href="/products"
                  aria-current={!activeSlug ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "block rounded-card px-3 py-2 text-sm font-bold transition-colors",
                    !activeSlug
                      ? "bg-flame-50 text-flame-700 ring-1 ring-flame-200"
                      : "text-ink hover:bg-flame-50/50 hover:text-flame-700",
                  )}
                >
                  همه محصولات
                </Link>
                {roots.map((root) => {
                  const children = categories.filter(
                    (category) => category.parentId === root.id,
                  );
                  return (
                    <div key={root.id}>
                      <Link
                        href={`/category/${root.slug}`}
                        aria-current={root.slug === activeSlug ? "page" : undefined}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "block rounded-card px-3 py-2 text-sm font-bold transition-colors",
                          root.slug === activeSlug
                            ? "bg-flame-50 text-flame-700 ring-1 ring-flame-200"
                            : "text-ink hover:bg-flame-50/50 hover:text-flame-700",
                        )}
                      >
                        {root.name}
                      </Link>
                      {children.length > 0 && (
                        <div className="mt-1 space-y-0.5 border-r border-flame-200/80 pr-3">
                          {children.map((child) => (
                            <Link
                              key={child.id}
                              href={`/category/${child.slug}`}
                              aria-current={child.slug === activeSlug ? "page" : undefined}
                              onClick={() => setOpen(false)}
                              className={cn(
                                "block rounded-card px-3 py-1.5 text-xs transition-colors",
                                child.slug === activeSlug
                                  ? "bg-flame-50 font-semibold text-flame-700 ring-1 ring-flame-200"
                                  : "text-ash hover:bg-flame-50/50 hover:text-flame-700",
                              )}
                            >
                              {child.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}

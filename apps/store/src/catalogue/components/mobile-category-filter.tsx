"use client";

import Link from "next/link";
import { useState } from "react";
import { Drawer } from "@heroui/react";
import type { CategorySummary } from "@/types";
import { cn } from "@kmodern/ui";
import { SortFieldset, type ListingSort } from "@/catalogue/components/listing-rail";

export function MobileCategoryFilter({
  categories,
  activeSlug,
  action,
  sort,
  query,
}: {
  categories: CategorySummary[];
  activeSlug?: string;
  action: string;
  sort?: ListingSort;
  query?: string;
}) {
  const [open, setOpen] = useState(false);
  const roots = categories.filter((category) => !category.parentId);

  return (
    <Drawer isOpen={open} onOpenChange={setOpen}>
      <Drawer.Trigger aria-label="فیلتر و مرتب‌سازی" className="flex min-h-11 items-center gap-2 rounded-card border border-flame-200/80 bg-flame-50/60 px-4 text-sm font-semibold text-flame-700 transition-colors hover:border-flame-300 hover:bg-flame-50 lg:hidden">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
          <path d="M4 7h16M7 12h10M10 17h4" />
        </svg>
        فیلتر و مرتب‌سازی
      </Drawer.Trigger>
      <Drawer.Backdrop>
        <Drawer.Content placement="left">
          <Drawer.Dialog>
            <Drawer.Header className="mb-5 flex-row items-center justify-between border-b border-plaster pb-4">
              <Drawer.Heading className="font-display text-lg font-black text-ink">دسته‌بندی‌ها</Drawer.Heading>
              <Drawer.CloseTrigger aria-label="بستن" />
            </Drawer.Header>
            <Drawer.Body>
              <div className="mb-5">
                <SortFieldset action={action} sort={sort} query={query} />
              </div>
              <div className="mb-4 border-t border-plaster" />
              <nav className="space-y-5">
                <Link
                  href="/products"
                  aria-current={!activeSlug ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn("block rounded-card px-3 py-2.5 text-sm font-bold transition-colors", !activeSlug ? "bg-flame-50 text-flame-700 ring-1 ring-flame-200" : "text-ink hover:bg-flame-50/50 hover:text-flame-700")}
                >
                  همه محصولات
                </Link>
                {roots.map((root) => {
                  const children = categories.filter((category) => category.parentId === root.id);
                  return (
                    <div key={root.id}>
                      <Link
                        href={`/category/${root.slug}`}
                        aria-current={root.slug === activeSlug ? "page" : undefined}
                        onClick={() => setOpen(false)}
                        className={cn("block rounded-card px-3 py-2.5 text-sm font-bold transition-colors", root.slug === activeSlug ? "bg-flame-50 text-flame-700 ring-1 ring-flame-200" : "text-ink hover:bg-flame-50/50 hover:text-flame-700")}
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
                              className={cn("block rounded-card px-3 py-2 text-sm transition-colors", child.slug === activeSlug ? "bg-flame-50 font-semibold text-flame-700 ring-1 ring-flame-200" : "text-ash hover:bg-flame-50/50 hover:text-flame-700")}
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

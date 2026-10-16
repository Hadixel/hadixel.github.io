"use client";

import { toFaDigits } from "@kmodern/contracts/format";
import { cn } from "@kmodern/ui";
import type { CategorySummary } from "@/types";
import { SORTS, type ListingSort } from "@/catalogue/components/sort-options";
import { CategoryTree, type CategoryTreeItem } from "@/catalogue/components/category-tree";

/* The values and the normalizer live in the server-safe module above; only the
   types are re-exported here for the rail's consumers. */
export type { ListingSort } from "@/catalogue/components/sort-options";

/*
 * SortFieldset — radio rows instead of a select-plus-Apply pair: the choice
 * applies the moment it changes (same GET-form navigation the old select used),
 * so there is no second control to press. One form owns sort + the preserved
 * search query, and nothing else — a category link is a navigation, not a
 * facet of this form.
 */
export function SortFieldset({
  action,
  sort,
  query,
}: {
  action: string;
  sort?: ListingSort;
  query?: string;
}) {
  return (
    <form action={action} method="GET" onChange={(event) => event.currentTarget.requestSubmit()}>
      {query && <input type="hidden" name="q" value={query} />}
      <div className="grid gap-1">
        {SORTS.map((s) => {
          const active = (sort ?? "newest") === s.value;
          return (
            <label
              key={s.value}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-card px-3 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "bg-flame-50 text-flame-800 ring-1 ring-flame-200"
                  : "text-ash hover:bg-plaster hover:text-ink",
              )}
            >
              <input
                type="radio"
                name="sort"
                value={s.value}
                defaultChecked={active}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "size-4 shrink-0 rounded-full border",
                  active ? "border-[5px] border-flame-700" : "border-fog",
                )}
              />
              {s.label}
            </label>
          );
        })}
      </div>
    </form>
  );
}

/*
 * ListingFilterRail — the listing page's right-hand column: one card holding
 * sort and the category tree. It replaces the bare CategorySidebar plus the
 * header's select+Apply pair; the count is the same `products.length` the
 * page header already prints, so no extra gateway call.
 */
export function ListingFilterRail({
  categories,
  activeSlug,
  action,
  sort,
  query,
  count,
}: {
  categories: CategorySummary[];
  activeSlug?: string;
  action: string;
  sort?: ListingSort;
  query?: string;
  count: number;
}) {
  /* The rail is a tree, not a list: each root owns its sub-categories, built
     here from the gateway's flat list because the disclosure is the only state
     and the URL owns everything else. */
  const items: CategoryTreeItem[] = categories
    .filter((c) => !c.parentId)
    .map((root) => ({
      value: root.slug,
      label: root.name,
      href: `/category/${root.slug}`,
      children: categories
        .filter((c) => c.parentId === root.id)
        .map((child) => ({
          value: child.slug,
          label: child.name,
          href: `/category/${child.slug}`,
        })),
    }));

  return (
    <aside className="store-sticky hidden h-[calc(100dvh-var(--store-header-offset)-2.5rem)] w-full overflow-y-auto self-start me-4 lg:block">
      <div className="flex h-full flex-col rounded-card border border-fog bg-canvas p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-black text-ink">فیلتر و مرتب‌سازی</span>
          <span className="text-micro font-semibold text-ash">{toFaDigits(count)} محصول</span>
        </div>
        <SortFieldset action={action} sort={sort} query={query} />
        <div className="my-4 border-t border-plaster" />
        <div className="mb-2 text-sm font-black text-ink">دسته‌بندی‌ها</div>
        <div className="min-h-0 flex-1">
          <CategoryTree items={items} activeValue={activeSlug} />
        </div>
      </div>
    </aside>
  );
}

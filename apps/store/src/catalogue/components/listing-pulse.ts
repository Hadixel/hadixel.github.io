import { SORTS, type ListingSort } from "@/catalogue/components/sort-options";
import type { CategorySummary } from "@/types";

export interface ListingPulseChip {
  key: "category" | "query";
  label: string;
  href: string;
  removable: true;
  active: true;
}

export interface ListingPulseSort {
  value: ListingSort;
  label: string;
  href: string;
  active: boolean;
}

export interface ListingPulseInput {
  count: number;
  categories: CategorySummary[];
  activeSlug?: string;
  query?: string;
  sort?: ListingSort;
  action: string;
}

export interface ListingPulse {
  count: number;
  chips: ListingPulseChip[];
  sorts: ListingPulseSort[];
}

function paramsOf(entries: Array<[string, string | undefined]>): string {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

export function listingPulse(input: ListingPulseInput): ListingPulse {
  const { count, categories, activeSlug, query, sort, action } = input;
  const normalizedSort = sort ?? "newest";
  const preserveSort = normalizedSort === "newest" ? undefined : normalizedSort;

  const chips: ListingPulseChip[] = [];
  if (activeSlug) {
    const name =
      categories.find((c) => c.slug === activeSlug)?.name ?? activeSlug.replace(/-/g, " ");
    const extras: Array<[string, string | undefined]> = [
      ["q", query],
      ["sort", preserveSort],
    ];
    const qs = paramsOf(extras);
    chips.push({
      key: "category",
      label: name,
      href: qs ? `/products?${qs}` : "/products",
      removable: true,
      active: true,
    });
  }
  if (query) {
    const qs = paramsOf([["sort", preserveSort]]);
    chips.push({
      key: "query",
      label: `«${query}»`,
      href: qs ? `${action}?${qs}` : action,
      removable: true,
      active: true,
    });
  }

  const sorts: ListingPulseSort[] = SORTS.map((s) => {
    const qs = paramsOf([
      ["q", query],
      ["sort", s.value === "newest" ? undefined : s.value],
    ]);
    return {
      value: s.value,
      label: s.label,
      href: qs ? `${action}?${qs}` : action,
      active: normalizedSort === s.value,
    };
  });

  return { count, chips, sorts };
}

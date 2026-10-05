/*
 * Listing sort values — shared by the client rail (`listing-rail.tsx`) and the
 * server pages that normalize `?sort=` off the URL. Deliberately NOT
 * `"use client"`: a client module's runtime exports become client references on
 * the server, and calling one from a page throws ("normalizeListingSort is on
 * the client"). Pure data and a pure function: importable from both sides.
 */

export const SORTS = [
  { value: "newest", label: "جدیدترین" },
  { value: "price-asc", label: "ارزان‌ترین" },
  { value: "price-desc", label: "گران‌ترین" },
] as const;

export type ListingSort = (typeof SORTS)[number]["value"];

export function normalizeListingSort(value?: string): ListingSort | undefined {
  return SORTS.some((sort) => sort.value === value) ? (value as ListingSort) : undefined;
}

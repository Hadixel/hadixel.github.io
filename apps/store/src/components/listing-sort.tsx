"use client";

export function ListingSort({
  action,
  sort,
  query,
}: {
  action: string;
  sort?: string;
  query?: string;
}) {
  return (
    <form action={action} method="GET" className="flex items-center gap-2" onChange={(event) => event.currentTarget.form?.requestSubmit()}>
      {query && <input type="hidden" name="q" value={query} />}
      <label htmlFor="sort" className="hidden text-xs text-ash sm:block">مرتب‌سازی:</label>
      <select
        id="sort"
        name="sort"
        defaultValue={sort ?? "newest"}
        className="h-11 rounded-card border border-fog bg-canvas px-3 text-sm text-ink outline-none transition focus:border-flame-700"
        aria-label="مرتب‌سازی محصولات"
      >
        <option value="newest">جدیدترین</option>
        <option value="price-asc">ارزان‌ترین</option>
        <option value="price-desc">گران‌ترین</option>
      </select>
      <button type="submit" className="min-h-11 rounded-card border border-fog bg-canvas px-3 text-xs font-bold text-ink transition-colors hover:bg-plaster">
        اعمال
      </button>
    </form>
  );
}

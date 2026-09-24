import Link from "next/link";

export default function Breadcrumbs({ category, categoryName, productName }: { category?: string; categoryName?: string; productName?: string }) {
  return (
    <nav aria-label="مسیر صفحه" className="mb-6 flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-ash sm:text-sm">
      <Link href="/" className="shrink-0 transition-colors hover:text-ink">خانه</Link>
      {category && (
        <>
          <span className="text-fog" aria-hidden>/</span>
          <Link href={`/category/${category}`} className="shrink-0 transition-colors hover:text-ink">{categoryName}</Link>
        </>
      )}
      {productName && (
        <>
          <span className="text-fog" aria-hidden>/</span>
          <span className="truncate text-ink" aria-current="page">{productName}</span>
        </>
      )}
    </nav>
  );
}

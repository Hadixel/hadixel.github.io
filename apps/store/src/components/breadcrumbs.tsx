import Link from "next/link";

export default function Breadcrumbs({ category, categoryName, productName }: { category?: string; categoryName?: string; productName?: string }) {
  return (
    <nav className="mb-6 flex items-center gap-2 text-sm text-ash">
      <Link href="/" className="hover:text-flame-700">خانه</Link>
      {category && <><span>/</span><Link href={`/category/${category}`} className="hover:text-flame-700">{categoryName}</Link></>}
      {productName && <><span>/</span><span className="text-ink">{productName}</span></>}
    </nav>
  );
}
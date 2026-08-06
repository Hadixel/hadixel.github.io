import Link from "next/link";

export default function Breadcrumbs({ category, categoryName, productName }: { category?: string; categoryName?: string; productName?: string }) {
  return (
    <nav className="mb-6 flex items-center gap-2 text-sm text-gray-500">
      <Link href="/" className="hover:text-amber-600">خانه</Link>
      {category && <><span>/</span><Link href={`/category/${category}`} className="hover:text-amber-600">{categoryName}</Link></>}
      {productName && <><span>/</span><span className="text-gray-800">{productName}</span></>}
    </nav>
  );
}
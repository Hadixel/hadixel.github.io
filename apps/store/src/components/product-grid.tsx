import Link from "next/link";
import Image from "next/image";
import { formatToman, toFaDigits } from "@kmodern/schema";

export interface GridProduct {
  id: string;
  slug: string;
  name: string;
  brand: string;
  price: number;
  maxPrice: number;
  available: boolean;
  image: string | null;
  variantCount: number;
}

export function ProductGrid({ products, title }: { products: GridProduct[]; title?: string }) {
  if (products.length === 0) {
    return <div className="mx-auto max-w-7xl px-4 py-16 text-center text-gray-500">محصولی یافت نشد</div>;
  }
  return (
    <section className="mx-auto max-w-7xl px-4 py-10">
      {title && <h1 className="mb-6 text-2xl font-bold">{title}</h1>}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}

export function ProductCard({ product }: { product: GridProduct }) {
  const from = product.price === product.maxPrice;
  return (
    <Link href={`/product/${product.slug}`} className="group rounded-xl border bg-white p-3 transition hover:shadow-lg">
      <div className="relative mb-3 aspect-square overflow-hidden rounded-lg bg-gray-100">
        {product.image ? (
          <Image src={product.image} alt={product.name} fill sizes="(max-width:768px) 50vw, 25vw" className="object-cover transition group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">بدون تصویر</div>
        )}
      </div>
      <div className="text-sm font-semibold leading-snug text-slate-800 line-clamp-2">{product.name}</div>
      <div className="mt-2 text-sm font-bold text-slate-900">
        {from ? formatToman(product.price) : `${formatToman(product.price)} تا ${formatToman(product.maxPrice)}`}
      </div>
      {product.variantCount > 1 && <div className="mt-0.5 text-xs text-gray-400">{toFaDigits(product.variantCount)} رنگ</div>}
    </Link>
  );
}
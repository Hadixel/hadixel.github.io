import { notFound } from "next/navigation";
import Image from "next/image";
import { getProductBySlug, getPublishedProducts } from "@/lib/queries";
import { formatToman } from "@kmodern/schema";
import { VariantPicker } from "@/components/variant-picker";
import { ProductCard } from "@/components/product-grid";
import Breadcrumbs from "@/components/breadcrumbs";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const related = (await getPublishedProducts({ categoryId: product.categoryId, limit: 8 })).filter((p) => p.slug !== slug);

  const variants = product.variants.map((v) => ({
    id: v.id,
    colorName: v.colorName,
    colorCode: v.colorCode,
    price: v.price,
    stock: v.stock,
    reserved: v.reserved,
    allowBackorder: v.allowBackorder,
    images: v.images,
    sku: v.sku,
    available: v.allowBackorder || v.stock - v.reserved > 0,
  }));

  const primary = variants[0] ?? null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Breadcrumbs category={product.category.slug} categoryName={product.category.name} productName={product.name} />

      <div className="grid gap-10 lg:grid-cols-2">
        {/* gallery */}
        <div>
          {primary ? (
            <div className="grid gap-2">
              {primary.images.length > 0 ? (
                primary.images.map((src, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden rounded-2xl bg-gray-50">
                    <Image src={src} alt={product.name} fill sizes="50vw" className="object-contain" />
                  </div>
                ))
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-2xl bg-gray-50 text-gray-400">بدون تصویر</div>
              )}
            </div>
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-2xl bg-gray-50 text-gray-400">بدون تصویر</div>
          )}
        </div>

        {/* info */}
        <div>
          <div className="text-sm text-gray-500">{product.brand}</div>
          <h1 className="mt-1 text-3xl font-bold">{product.name}</h1>
          {product.description && <p className="mt-3 text-gray-600">{product.description}</p>}

          <div className="mt-6 rounded-xl bg-amber-50 p-5">
            {primary ? (
              <div className="text-2xl font-bold">{formatToman(primary.price)}</div>
            ) : (
              <div className="text-gray-500">ناموجود</div>
            )}
            <div className="mt-1 text-sm text-gray-500">قیمت هر واحد / تومان</div>
          </div>

          <div className="mt-6">
            <div className="mb-2 text-sm font-semibold text-gray-700">انتخاب رنگ</div>
            <VariantPicker variants={variants} productName={product.name} />
          </div>

          {/* specs */}
          {product.specValues.length > 0 && (
            <div className="mt-8 rounded-xl border">
              <div className="border-b px-4 py-3 font-bold">مشخصات فنی</div>
              <dl className="divide-y">
                {product.specValues.map((sv) => (
                  <div key={sv.specFieldId} className="grid grid-cols-2 gap-4 px-4 py-2.5 text-sm">
                    <dt className="text-gray-500">{sv.specField.name}</dt>
                    <dd>{String(sv.value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {product.features.length > 0 && (
            <ul className="mt-6 list-disc space-y-1 pr-5 text-gray-700">
              {product.features.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <div className="mt-16">
          <h2 className="mb-6 text-2xl font-bold">محصولات مشابه</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{related.map((p) => <ProductCard key={p.id} product={p} />)}</div>
        </div>
      )}
    </div>
  );
}
import { notFound } from "next/navigation";
import { getProductBySlug, getPublishedProducts } from "@/lib/queries";
import { ProductBuyBox } from "@/components/product-buy-box";
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


  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Breadcrumbs category={product.category.slug} categoryName={product.category.name} productName={product.name} />

      <ProductBuyBox
        variants={variants}
        productName={product.name}
        model={product.model}
        description={product.description}
        specs={
          <>
            {product.specValues.length > 0 && (
              <div className="mt-8 border-t border-plaster">
                <div className="border-b border-plaster py-3 text-sm font-black text-ink">مشخصات فنی</div>
                <dl className="divide-y divide-plaster">
                  {product.specValues.map((sv) => (
                    <div key={sv.specFieldId} className="grid grid-cols-2 gap-4 py-2.5 text-sm">
                      <dt className="text-ash">{sv.specField.name}</dt>
                      <dd className="text-ink">{String(sv.value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {product.features.length > 0 && (
              <ul className="mt-6 space-y-1.5 text-sm text-ink">
                {product.features.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="mt-[9px] h-px w-3 shrink-0 bg-ink" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </>
        }
      />

      {related.length > 0 && (
        <div className="mt-20">
          <h2 className="mb-8 text-2xl font-black text-ink">محصولات مشابه</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{related.map((p) => <ProductCard key={p.id} product={p} />)}</div>
        </div>
      )}
    </div>
  );
}
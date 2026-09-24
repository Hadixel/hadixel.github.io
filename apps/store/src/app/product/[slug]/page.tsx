import { notFound } from "next/navigation";
import { getProductBySlug, getPublishedProducts } from "@/lib/queries";
import { SectionHeader } from "@kmodern/ui";
import { ProductBuyBox } from "@/components/product-buy-box";
import { ProductGrid } from "@/components/product-grid";
import Breadcrumbs from "@/components/breadcrumbs";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const related = (await getPublishedProducts({ categoryId: product.categoryId, limit: 8 }))
    .filter((item) => item.slug !== slug)
    .slice(0, 4);

  const variants = product.variants.map((variant) => ({
    id: variant.id,
    colorName: variant.colorName,
    colorCode: variant.colorCode,
    price: variant.price,
    stock: variant.stock,
    reserved: variant.reserved,
    allowBackorder: variant.allowBackorder,
    images: variant.images,
    sku: variant.sku,
    available: variant.allowBackorder || variant.stock - variant.reserved > 0,
  }));

  const hasTechnicalDetails = product.specValues.length > 0 || product.features.length > 0;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 sm:py-8">
      <Breadcrumbs category={product.category.slug} categoryName={product.category.name} productName={product.name} />

      <ProductBuyBox
        variants={variants}
        productName={product.name}
        model={product.model}
        description={product.description}
        details={
          hasTechnicalDetails ? (
            <div className="mt-4 space-y-4">
              {product.specValues.length > 0 && (
                <section className="overflow-hidden rounded-card bg-plaster/60 p-5 sm:p-7" aria-labelledby="product-specs-title">
                  <h2 id="product-specs-title" className="font-display text-xl font-black text-ink">مشخصات فنی</h2>
                  <dl className="mt-5 divide-y divide-fog/70 border-y border-fog/70">
                    {product.specValues.map((specValue) => (
                      <div key={specValue.specFieldId} className="grid grid-cols-[minmax(7rem,0.8fr)_minmax(0,1.2fr)] gap-4 py-3.5 text-sm sm:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1.3fr)]">
                        <dt className="text-ash">{specValue.specField.name}</dt>
                        <dd className="font-semibold leading-7 text-ink">{String(specValue.value)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {product.features.length > 0 && (
                <section className="rounded-card bg-plaster/60 p-5 sm:p-7" aria-labelledby="product-features-title">
                  <h2 id="product-features-title" className="font-display text-xl font-black text-ink">ویژگی‌های شاخص</h2>
                  <ul className="mt-5 grid gap-3 text-sm leading-7 text-ink sm:grid-cols-2">
                    {product.features.map((feature, index) => (
                      <li key={`${feature}-${index}`} className="flex gap-3">
                        <span className="mt-[13px] h-px w-4 shrink-0 bg-flame-700" aria-hidden />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          ) : null
        }
      />

      {related.length > 0 && (
        <section className="mt-20 border-t border-plaster pt-14 sm:mt-24">
          <SectionHeader title="محصولات مشابه" seeAllHref={`/category/${product.category.slug}`} />
          <ProductGrid products={related} ariaLabel="محصولات مشابه" />
        </section>
      )}
    </div>
  );
}

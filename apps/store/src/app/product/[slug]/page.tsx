import { notFound } from "next/navigation";
import { getProductBySlug, getPublishedProducts } from "@/lib/queries";
import { SectionHeader } from "@kmodern/ui";
import { toFaDigits } from "@kmodern/contracts/format";
import { ProductBuyBox } from "@/catalogue/components/product-buy-box";
import { ProductGrid } from "@/catalogue/components/product-grid";
import Breadcrumbs from "@/catalogue/components/breadcrumbs";

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
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:py-8">
      <Breadcrumbs category={product.category.slug} categoryName={product.category.name} productName={product.name} />

      <ProductBuyBox
        variants={variants}
        productName={product.name}
        model={product.model}
        description={product.description}
        discount={product.discount}
        detailsSummary={`مشخصات فنی و ویژگی‌ها · ${toFaDigits(product.specValues.length + product.features.length)} مورد`}
        details={
          hasTechnicalDetails ? (
            <div>
              <div className="product-details-heading">
                <div>
                  <h2 className="font-display text-2xl font-black text-ink">جزئیات محصول</h2>
                  <p className="mt-2 text-sm leading-7 text-ash">برای انتخاب دقیق‌تر، مشخصات فنی و نکات کلیدی این محصول را بررسی کنید.</p>
                </div>
                <div className="product-details-counts" aria-label="خلاصه جزئیات محصول">
                  {product.specValues.length > 0 && <span><b>{toFaDigits(product.specValues.length)}</b> مورد مشخصات</span>}
                  {product.features.length > 0 && <span><b>{toFaDigits(product.features.length)}</b> ویژگی</span>}
                </div>
              </div>

              <div className="product-details-extra">
                {product.specValues.length > 0 && (
                  <section className="product-specs product-spec-panel" aria-labelledby="product-specs-title">
                    <div className="product-section-heading">
                      <h2 id="product-specs-title" className="font-display text-xl font-black">مشخصات فنی</h2>
                      <span className="product-section-line" aria-hidden />
                    </div>
                    <dl className="product-spec-list">
                      {product.specValues.map((specValue) => (
                        <div key={specValue.specFieldId} className="product-spec-row">
                          <dt>{specValue.specField.name}</dt>
                          <dd>{toFaDigits(specValue.value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}

                {product.features.length > 0 && (
                  <section className="product-features product-feature-panel" aria-labelledby="product-features-title">
                    <div className="product-section-heading">
                      <h2 id="product-features-title" className="font-display text-xl font-black">ویژگی‌های شاخص</h2>
                      <span className="product-section-line" aria-hidden />
                    </div>
                    <ul className="product-feature-list">
                      {product.features.map((feature, index) => (
                        <li key={`${feature}-${index}`} className="product-feature-row">
                          <span className="product-feature-marker" aria-hidden />
                          <span>{toFaDigits(feature)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
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

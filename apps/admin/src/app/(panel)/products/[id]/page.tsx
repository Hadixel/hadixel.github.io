import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@kmodern/db";
import { ProductForm } from "@/components/product-form";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories] = await Promise.all([
    db().product.findUnique({
      where: { id },
      include: { variants: { orderBy: { colorName: "asc" } }, specValues: true },
    }),
    db().category.findMany({
      orderBy: { sortOrder: "asc" },
      include: { specFields: { orderBy: { sortOrder: "asc" } } },
    }),
  ]);
  if (!product) notFound();

  const specValues = Object.fromEntries(product.specValues.map((sv) => [sv.specFieldId, sv.value]));
  const seo = (product.seo ?? {}) as Record<string, unknown>;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/products" className="text-sm text-ash hover:underline">محصولات</Link>
        <h1 className="text-xl font-bold text-ink">{product.name}</h1>
        <span className="text-xs text-ash" dir="ltr">{product.slug}</span>
      </div>
      <ProductForm
        product={{
          id: product.id,
          name: product.name,
          brand: product.brand,
          model: product.model,
          slug: product.slug,
          categoryId: product.categoryId,
          description: product.description,
          features: product.features,
          status: product.status,
          allowBackorder: product.allowBackorder,
          seo,
          variants: product.variants.map((v) => ({
            id: v.id,
            colorName: v.colorName,
            colorCode: v.colorCode,
            sku: v.sku,
            price: v.price,
            stock: v.stock,
            allowBackorder: v.allowBackorder,
            images: v.images,
          })),
          specValues,
        }}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          specFields: c.specFields.map((sf) => ({ id: sf.id, name: sf.name, type: sf.type, unit: sf.unit })),
        }))}
      />
    </div>
  );
}
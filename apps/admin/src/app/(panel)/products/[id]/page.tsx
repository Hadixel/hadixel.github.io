// One product, for the edit form to seed itself from, read through the gateway.
//
// This page used to import the data tier and run two queries of its own: the product with its variants
// and spec values, and the category tree the form renders an input per field from. Both are gateway
// reads now.
//
// The read is the form's shape rather than the row's, which is why there is no translation left in
// this file. The spec values used to be a list of rows that this page folded into a record keyed by
// spec-field id — a projection performed here, and therefore a projection someone could get wrong
// without noticing. The gateway sends that record. `seo` likewise crosses as a record or nothing
// rather than as a `Json` column this page cast.
//
// So what is left is the page: two reads it cannot render without, and the 404 that says this id is
// not a product.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/product-form";
import { readThrough } from "@/lib/reads";

/** One product in full, as the gateway's `GET /products/:id` answers. */
interface ProductDetail {
  id: string;
  name: string;
  brand: string;
  model: string;
  slug: string;
  categoryId: string;
  description: string | null;
  features: string[];
  status: string;
  allowBackorder: boolean;
  seo: Record<string, unknown> | null;
  variants: {
    id: string;
    colorName: string;
    colorCode: string | null;
    sku: string;
    price: number;
    stock: number;
    allowBackorder: boolean;
    images: string[];
  }[];
  specValues: Record<string, string>;
}

/** The categories the form offers, as the gateway's `GET /categories/options` answers. */
interface CategoryOption {
  id: string;
  name: string;
  specFields: { id: string; name: string; type: string; unit: string | null }[];
}

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // The categories go out beside the product rather than after it: the form cannot render without both,
  // and a read that is only needed to label the other one does not have to wait for it to fail first.
  const categoriesPromise = readThrough<CategoryOption[]>("/categories/options");

  let product: ProductDetail;
  try {
    product = await readThrough<ProductDetail>(`/products/${encodeURIComponent(id)}`);
  } catch (error) {
    // A 404 is this page's answer and anything else is a fault, so the two are told apart rather than
    // collapsed: a gateway that is down must not look like a product that does not exist, and must not
    // render a blank form that saves over whatever the id actually named.
    if (isNotFound(error)) notFound();
    throw error;
  }
  const categories = await categoriesPromise;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/products" className="text-sm text-ash hover:underline">محصولات</Link>
        <h1 className="text-xl font-bold text-ink">{product.name}</h1>
        <span className="text-xs text-ash" dir="ltr">{product.slug}</span>
      </div>
      {/* Straight through, with no field renamed on the way. The read answers the form's own prop
          type, so anything this page had to map is a shape the gateway got wrong. */}
      <ProductForm product={product} categories={categories} />
    </div>
  );
}

/** Is this the gateway saying the product is not there? */
function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.message.includes("پیدا نشد");
}

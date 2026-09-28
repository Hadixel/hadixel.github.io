// The new-product form's categories, read through the gateway.
//
// The page used to import the data tier and read the tree itself, carrying each category's declared
// spec fields because the form renders an input per field. That question — *what fields does this
// category declare* — is the category's to answer, so the gateway answers it and the page asks.

import { ProductForm } from "@/components/product-form";
import { readThrough } from "@/lib/reads";

/** One category as the gateway's `GET /categories/options` answers. */
interface CategoryOption {
  id: string;
  name: string;
  specFields: { id: string; name: string; type: string; unit: string | null }[];
}

export default async function NewProductPage() {
  const categories = await readThrough<CategoryOption[]>("/categories/options");

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold text-ink">محصول جدید</h1>
      <ProductForm categories={categories} />
    </div>
  );
}

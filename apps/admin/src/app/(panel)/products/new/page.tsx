import { db } from "@kmodern/db";
import { ProductForm } from "@/components/product-form";

export default async function NewProductPage() {
  const categories = await db().category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { specFields: { orderBy: { sortOrder: "asc" } } },
  });
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold text-ink">محصول جدید</h1>
      <ProductForm
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          specFields: c.specFields.map((sf) => ({ id: sf.id, name: sf.name, type: sf.type, unit: sf.unit })),
        }))}
      />
    </div>
  );
}
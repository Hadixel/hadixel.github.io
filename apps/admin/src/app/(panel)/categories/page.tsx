import { db } from "@kmodern/db";
import { CategoriesManager } from "./categories-manager";

export default async function CategoriesPage() {
  const categories = await db().category.findMany({
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
    include: {
      parent: { select: { id: true, name: true } },
      specFields: { orderBy: { sortOrder: "asc" } },
      _count: { select: { products: true, children: true } },
    },
  });
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-xl font-bold text-ink">دسته‌بندی‌ها</h1>
      <CategoriesManager
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          parentId: c.parentId,
          parentName: c.parent?.name,
          weightKg: c.weightKg,
          sortOrder: c.sortOrder,
          productCount: c._count.products,
          childCount: c._count.children,
          specFields: c.specFields.map((sf) => ({
            id: sf.id,
            name: sf.name,
            type: sf.type,
            unit: sf.unit ?? undefined,
            filterable: sf.filterable,
            sortOrder: sf.sortOrder,
          })),
        }))}
      />
    </div>
  );
}
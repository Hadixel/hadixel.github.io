// The category tree, read through the gateway.
//
// This page used to import the data tier and query the tree itself, with each row carrying its
// parent's name, its product and child counts, and its declared spec fields — because the manager
// renders all of them and holds only ids. One gateway read answers the same shape, so the page is a
// client of the shop's data rather than a second holder of it.

import { readThrough } from "@/lib/reads";
import { CategoriesManager } from "@/catalogue/components/categories-manager";

/** One category, as the gateway's `GET /categories` answers. */
interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  parentName?: string;
  weightKg: number;
  sortOrder: number;
  productCount: number;
  childCount: number;
  specFields: {
    id: string;
    name: string;
    type: string;
    unit?: string;
    filterable: boolean;
    sortOrder: number;
  }[];
}

export default async function CategoriesPage() {
  const categories = await readThrough<CategorySummary[]>("/categories");

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-xl font-bold text-ink">دسته‌بندی‌ها</h1>
      <CategoriesManager categories={categories} />
    </div>
  );
}

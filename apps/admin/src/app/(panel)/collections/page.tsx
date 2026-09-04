import { db } from "@kmodern/db";
import { CollectionsManager } from "./collections-manager";

export default async function CollectionsPage() {
  const [collections, products] = await Promise.all([
    db().collection.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        items: { orderBy: { sortOrder: "asc" }, include: { product: { select: { name: true, slug: true } } } },
      },
    }),
    db().product.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold text-ink">مجموعه‌ها</h1>
      <CollectionsManager
        products={products}
        collections={collections.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          sortOrder: c.sortOrder,
          items: c.items.map((it) => ({ productId: it.productId, productName: it.product.name, sortOrder: it.sortOrder })),
        }))}
      />
    </div>
  );
}
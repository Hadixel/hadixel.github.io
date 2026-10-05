// The collections list, read through the gateway.
//
// This page used to import the data tier and query it itself — the collections with their members, and
// the product list the editor labels its rows with. Both are gateway reads now, which is what
// criterion 10 asks for and what makes the page a *client* of the shop's data rather than a second
// holder of it.
//
// The two reads go together because the editor cannot render without both: it holds product ids and
// needs names beside them. One page, one `Promise.all`, and nothing is fetched to label a row afterwards.

import { readThrough } from "@/lib/reads";
import { CollectionsManager } from "@/catalogue/components/collections-manager";

/** One collection as the gateway's `GET /collections` answers. */
interface CollectionSummary {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  items: { productId: string; productName: string; sortOrder: number }[];
}

/** The catalogue's product names, as the gateway's `GET /products/options` answers. */
interface ProductOption {
  id: string;
  name: string;
}

export default async function CollectionsPage() {
  const [collections, products] = await Promise.all([
    readThrough<CollectionSummary[]>("/collections"),
    readThrough<ProductOption[]>("/products/options"),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold text-ink">مجموعه‌ها</h1>
      <CollectionsManager products={products} collections={collections} />
    </div>
  );
}

import { notFound } from "next/navigation";
import { db } from "@kmodern/db";
import { getPublishedProducts } from "@/lib/queries";
import { ProductGrid } from "@/components/product-grid";

export const dynamic = "force-dynamic";

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await db().collection.findUnique({ where: { slug } });
  if (!collection) notFound();
  const products = await getPublishedProducts({ collectionId: collection.id, limit: 60 });
  return <ProductGrid products={products} title={collection.name} />;
}
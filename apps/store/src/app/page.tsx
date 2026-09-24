import { getPublishedPage, getPublishedProducts } from "@/lib/queries";
import BlockRenderer from "@/components/block-renderer";
import { ProductGrid } from "@/components/product-grid";
import type { Block } from "@kmodern/schema";

export const dynamic = "force-dynamic";

// Home = SYSTEM page "home" published blocks (004). Fall back to product grid
// if the page is empty, so the storefront never renders blank.
export default async function HomePage() {
  const home = await getPublishedPage("home");
  const blocks = (home?.publishedBlocks as Block[] | null) ?? [];
  if (Array.isArray(blocks) && blocks.length > 0) {
    return <BlockRenderer blocks={blocks} />;
  }
  const products = await getPublishedProducts({ limit: 24 });
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-10">
      <ProductGrid products={products} title="محصولات" titleLevel="h1" />
    </div>
  );
}
import BlockRenderer from "@/content/components/block-renderer";
import { resolveBlockPayloads } from "@/content/lib/block-data";
import { ProductGrid } from "@/catalogue/components/product-grid";
import { loadHome } from "@/home/lib/home";

export const dynamic = "force-dynamic";

/**
 * The home page, read from the gateway.
 *
 * It renders its content from the gateway and it never touches the database: the read happens in
 * `loadHome`, which has no data-tier import to fall back on. With the gateway stopped this page
 * reports the failure rather than quietly serving rows from behind the gateway's back.
 *
 * The read carries the featured deals alongside the blocks, because the gateway resolves both in one
 * trip and a page that rendered them together should not make two round trips to see one moment.
 * Nothing here draws them yet: a deals section needs a `dealGrid` block, and that block type is part
 * of the CMS redesign rather than this change. The data is resolved, shipped and asserted so the
 * section is a rendering decision when the block type lands, not another read.
 *
 * The blocks' own reads are resolved here, before anything is drawn, rather than inside the
 * renderer: a page that renders a block list decides how many round trips it makes, and this one
 * makes them all at once.
 */
export default async function HomePage() {
  const home = await loadHome();

  if (home.failure) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-16" role="alert">
        <h1 className="font-display text-2xl font-extrabold text-ink">فروشگاه در دسترس نیست</h1>
        <p className="mt-3 text-sm leading-7 text-ash">
          اطلاعات این صفحه از درگاه خوانده می‌شود و در حال حاضر در دسترس نیست. لطفاً کمی بعد دوباره
          تلاش کنید.
        </p>
      </div>
    );
  }

  if (home.blocks.length > 0) {
    return <BlockRenderer blocks={home.blocks} payloads={await resolveBlockPayloads(home.blocks)} />;
  }

  // The CMS home page has no published blocks yet. Falling back to the newest products keeps the
  // storefront from rendering blank; the data still comes from the gateway.
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-10">
      <ProductGrid products={home.products} title="محصولات" titleLevel="h1" />
    </div>
  );
}
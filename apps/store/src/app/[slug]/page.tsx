import { notFound } from "next/navigation";
import BlockRenderer from "@/components/block-renderer";
import { EmptyState } from "@/components/empty-state";
import { lookupPage } from "@/lib/gateway-page";

export const dynamic = "force-dynamic";

// Custom + system content pages (about/contact/…) rendered from page-builder
// blocks (005). Unknown slug → 404.
//
// The blocks arrive from the gateway with their data resolved, because the renderer resolves
// nothing itself. An outage is rethrown rather than rendered as a 404, so a gateway blip does not
// look like a page that was deliberately deleted.
export default async function PageBySlug({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lookup = await lookupPage(slug);

  if (lookup.kind === "missing") notFound();
  if (lookup.kind === "unavailable") {
    throw new Error(`gateway unavailable while reading page "${slug}": ${lookup.reason}`);
  }
  const { page } = lookup;

  return (
    <div>
      <div className="border-b border-plaster bg-plaster/60">
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:py-14">
          <h1 className="font-display text-3xl font-black text-ink sm:text-4xl">{page.title}</h1>
        </div>
      </div>
      {page.blocks.length > 0 ? (
        <BlockRenderer blocks={page.blocks} />
      ) : (
        <EmptyState
          title="محتوای این صفحه هنوز آماده نیست"
          description="می‌توانید از فروشگاه یا مجله خانه مدرن ادامه دهید."
          action={{ label: "مشاهده محصولات", href: "/products" }}
        />
      )}
    </div>
  );
}
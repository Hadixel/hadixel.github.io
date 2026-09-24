import { notFound } from "next/navigation";
import { getPublishedPage } from "@/lib/queries";
import BlockRenderer from "@/components/block-renderer";
import type { Block } from "@kmodern/schema";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

// Custom + system content pages (about/contact/…) rendered from page-builder
// blocks (005). Unknown slug → 404.
export default async function PageBySlug({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPublishedPage(slug);
  if (!page) notFound();

  const blocks = (page.publishedBlocks as Block[] | null) ?? [];
  return (
    <div>
      <div className="border-b border-plaster bg-plaster/60">
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:py-14">
          <h1 className="font-display text-3xl font-black text-ink sm:text-4xl">{page.title}</h1>
        </div>
      </div>
      {blocks.length > 0 ? (
        <BlockRenderer blocks={blocks} />
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
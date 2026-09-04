import { notFound } from "next/navigation";
import { getPublishedPage } from "@/lib/queries";
import BlockRenderer from "@/components/block-renderer";
import type { Block } from "@kmodern/schema";

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
      <div className="border-b bg-plaster">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <h1 className="text-2xl font-bold">{page.title}</h1>
        </div>
      </div>
      <BlockRenderer blocks={blocks} />
    </div>
  );
}
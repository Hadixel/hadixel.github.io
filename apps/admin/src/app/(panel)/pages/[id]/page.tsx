import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@kmodern/db";
import { PageBuilder } from "@/components/page-builder";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await db().page.findUnique({ where: { id } });
  if (!page) notFound();
  const seo = (page.seo ?? {}) as Record<string, unknown>;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/pages" className="text-sm text-ash hover:underline">صفحات</Link>
        <h1 className="text-xl font-bold text-ink">ویرایش صفحه: {page.title}</h1>
      </div>
      <PageBuilder
        page={{
          id: page.id,
          title: page.title,
          slug: page.slug,
          kind: page.kind,
          status: page.status,
          blocks: (page.draftBlocks as Array<{ id: string; type: string; props: Record<string, unknown> }>).map((b) => ({
            id: b.id,
            type: b.type as never,
            props: b.props ?? {},
          })),
          seo,
        }}
      />
    </div>
  );
}
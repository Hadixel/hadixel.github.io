// One page, read through the gateway.
//
// The page used to import the data tier and read the row itself, then reached into `draftBlocks` to
// project each block down to the three fields the builder holds. Both halves are the gateway's now
// (`GET /pages/:id`): the read answers with the blocks already projected and with `seo` already an
// object, so there is nothing here to translate and no `(b.type as never)` to cast a string into a
// component type the read never promised.
//
// The blocks are the *draft* list, and that is the fix worth naming: seeding the builder from
// `publishedBlocks` opened a published page in an empty builder, and the first save published the
// empty list over the page the shop was serving.
//
// An id that names nobody is the gateway's 404 and reaches the error boundary. The old `notFound()`
// drew the same screen as a page with no blocks, on the screen where an operator decides whether to
// rebuild a page.

import Link from "next/link";
import { notFound } from "next/navigation";
import { readThrough } from "@/lib/reads";
import { PageBuilder } from "@/components/page-builder";

/** One page in full, as `GET /pages/:id` answers. Blocks are the draft list, projected already. */
interface PageDetail {
  id: string;
  title: string;
  slug: string;
  kind: string;
  status: string;
  blocks: { id: string; type: string; props: Record<string, unknown> }[];
  seo: Record<string, unknown>;
}

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let page: PageDetail;
  try {
    page = await readThrough<PageDetail>(`/pages/${encodeURIComponent(id)}`);
  } catch (error) {
    // A 404 is this page's answer and anything else is a fault, so the two are told apart rather than
    // collapsed: a gateway that is down must not look like a page that does not exist.
    if (isNotFound(error)) notFound();
    throw error;
  }

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
          // The builder narrows the type per block where it renders the type's own fields, which is
          // the one place that has the vocabulary to narrow it against.
          blocks: page.blocks.map((b) => ({ id: b.id, type: b.type as never, props: b.props })),
          seo: page.seo,
        }}
      />
    </div>
  );
}

/** Is this the gateway saying the page is not there? */
function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.message.includes("پیدا نشد");
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@kmodern/db";
import { BlogEditor } from "@/components/blog-editor";

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await db().post.findUnique({ where: { id }, include: { tags: { include: { tag: true } } } });
  if (!post) notFound();

  const products = await db().product.findMany({ select: { id: true, name: true }, take: 100 });
  const collections = await db().collection.findMany({ select: { id: true, name: true }, take: 100 });

  const body = (post.body ?? { type: "doc", content: [] }) as { type: string; content?: unknown[] };
  const seo = (post.seo ?? {}) as Record<string, unknown>;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/blog" className="text-sm text-slate-500 hover:underline">وبلاگ</Link>
        <h1 className="text-xl font-bold text-slate-900">ویرایش نوشته: {post.title}</h1>
      </div>
      <BlogEditor
        post={{
          id: post.id,
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt ?? "",
          coverImage: post.coverImage ?? "",
          byline: post.byline ?? "",
          status: post.status,
          featured: post.featured,
          commentsEnabled: post.commentsEnabled,
          publishAt: post.publishAt ? toDateTimeLocal(post.publishAt) : "",
          tags: post.tags.map((t) => t.tag.name),
          seo,
          body: body as { type: string; content?: unknown[] },
        }}
        products={products}
        collections={collections}
      />
    </div>
  );
}

function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
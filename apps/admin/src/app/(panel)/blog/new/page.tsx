import Link from "next/link";
import { db } from "@kmodern/db";
import { BlogEditor } from "@/components/blog-editor";

export default async function NewPost() {
  const products = await db().product.findMany({ select: { id: true, name: true }, take: 100 });
  const collections = await db().collection.findMany({ select: { id: true, name: true }, take: 100 });
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/blog" className="text-sm text-ash hover:underline">وبلاگ</Link>
        <h1 className="text-xl font-bold text-ink">نوشته جدید</h1>
      </div>
      <BlogEditor
        post={{
          title: "",
          slug: "",
          excerpt: "",
          coverImage: "",
          byline: "",
          status: "DRAFT",
          featured: false,
          commentsEnabled: true,
          publishAt: "",
          tags: [],
          seo: {},
          body: { type: "doc", content: [] },
        }}
        products={products}
        collections={collections}
      />
    </div>
  );
}
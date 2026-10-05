// The new-post editor's pickers, read through the gateway.
//
// Products and collections both, because the editor embeds either in a post. They went to the panel's
// own tables in two queries capped at a hundred each; the gateway answers both as option lists, and
// the cap is now stated in one place instead of being a number typed into a page.

import Link from "next/link";
import { BlogEditor } from "@/content/components/blog-editor";
import { readThrough } from "@/lib/reads";

/** An id and a label, which is all a picker needs. */
interface Option {
  id: string;
  name: string;
}

export default async function NewPost() {
  const [products, collections] = await Promise.all([
    readThrough<Option[]>("/products/options"),
    readThrough<Option[]>("/collections/options"),
  ]);

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

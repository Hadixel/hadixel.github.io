// One post, read through the gateway.
//
// The page used to import the data tier and read three things: the post with its tags, a hundred
// products for the body's product pickers, and a hundred collections for its collection pickers. The
// first is a gateway read now (`GET /posts/:id`); the other two already were (`/products/options` and
// `/collections/options`), which is why this page asked for them here rather than for one invented
// route: the pickers are the same lists the collection editor offers, and a second endpoint serving
// the same hundred rows would be a second answer to "which products can this post name".
//
// It also carried its own `toDateTimeLocal`, which formatted in the *server's* timezone. The shared
// one in `@/lib/date` formats in Tehran, which is both where the shop is and where the operator is, so
// an editor opened on a server running in UTC showed a publish time three and a half hours out. The
// duplicate is gone rather than kept as a second answer to the same question.
//
// An id that names nobody is the gateway's 404 and reaches the error boundary. The old `notFound()`
// drew the same screen as a post with no body and no tags, on the screen where an operator decides
// whether to edit a post.

import Link from "next/link";
import { notFound } from "next/navigation";
import { readThrough } from "@/lib/reads";
import { toDateTimeLocal } from "@/lib/date";
import { BlogEditor } from "@/content/components/blog-editor";

/**
 * One post in full, as `GET /posts/:id` answers.
 *
 * The nullable columns arrive as empty strings: every one of them is a text input in the editor, and
 * "no byline" is an empty box rather than an absent field the form has to decide what to do with. That
 * decision was the page's, and it was the same decision five times over.
 */
interface PostDetail {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string;
  byline: string;
  status: string;
  featured: boolean;
  commentsEnabled: boolean;
  publishAt: string | null;
  tags: string[];
  seo: Record<string, unknown>;
  body: { type: string; content?: unknown[] };
}

/** An id and a name, which is all a picker needs. */
interface PickerOption {
  id: string;
  name: string;
}

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let post: PostDetail;
  try {
    post = await readThrough<PostDetail>(`/posts/${encodeURIComponent(id)}`);
  } catch (error) {
    // A 404 is this page's answer and anything else is a fault, so the two are told apart rather than
    // collapsed: a gateway that is down must not look like a post that does not exist.
    if (isNotFound(error)) notFound();
    throw error;
  }

  // The three reads are independent and go together. The pickers cannot be fetched after the editor
  // has rendered, and an editor with an empty product list is a body whose product blocks cannot be
  // filled in.
  const [products, collections] = await Promise.all([
    readThrough<PickerOption[]>("/products/options"),
    readThrough<PickerOption[]>("/collections/options"),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/blog" className="text-sm text-ash hover:underline">وبلاگ</Link>
        <h1 className="text-xl font-bold text-ink">ویرایش نوشته: {post.title}</h1>
      </div>
      <BlogEditor
        post={{
          ...post,
          // Parsed back from the ISO string the wire carries, then rendered in the editor's own
          // wall-clock format — the same conversion the form's payload undoes on save. `publishAt` is
          // nullable on the post and a string in the form, so "not scheduled" is the empty box.
          publishAt: post.publishAt ? toDateTimeLocal(new Date(post.publishAt)) : "",
        }}
        products={products}
        collections={collections}
      />
    </div>
  );
}

/** Is this the gateway saying the post is not there? */
function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.message.includes("پیدا نشد");
}

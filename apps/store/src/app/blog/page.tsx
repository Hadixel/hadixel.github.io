import { getPublishedPosts } from "@/lib/queries";
import Link from "next/link";
import Image from "next/image";
import { toFaDigits } from "@kmodern/schema";

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  const posts = await getPublishedPosts(20);
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-8 text-3xl font-bold">وبلاگ</h1>
      {posts.length === 0 && <p className="text-gray-500">هنوز مطلبی منتشر نشده است.</p>}
      <div className="grid gap-6 md:grid-cols-3">
        {posts.map((post) => (
          <Link key={post.id} href={`/blog/${post.slug}`} className="group overflow-hidden rounded-xl border transition hover:shadow-lg">
            {post.coverImage && (
              <div className="relative aspect-[16/9] overflow-hidden bg-gray-100">
                <Image src={post.coverImage} alt={post.title} fill sizes="(max-width:768px) 100vw, 33vw" className="object-cover transition group-hover:scale-105" />
              </div>
            )}
            <div className="p-4">
              <h2 className="font-bold leading-snug group-hover:text-amber-600">{post.title}</h2>
              {post.excerpt && <p className="mt-2 line-clamp-2 text-sm text-gray-500">{post.excerpt}</p>}
              <div className="mt-3 text-xs text-gray-400">
                {post.publishAt ? new Date(post.publishAt).toLocaleDateString("fa-IR") : ""}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
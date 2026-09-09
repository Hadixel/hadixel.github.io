import { getPublishedPost } from "@/lib/queries";
import { notFound } from "next/navigation";
import Image from "next/image";
import PostBody from "@/components/post-body";

export const dynamic = "force-dynamic";

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      {post.coverImage && (
        <div className="relative mb-8 aspect-[16/9] overflow-hidden rounded-card bg-plaster">
          <Image src={post.coverImage} alt={post.title} fill sizes="100vw" className="object-cover" />
        </div>
      )}
      <h1 className="text-3xl font-bold">{post.title}</h1>
      <div className="mt-3 flex items-center gap-3 text-sm text-ash">
        <span>{post.byline ?? "خانه مدرن"}</span>
        {post.publishAt && <span>· {new Date(post.publishAt).toLocaleDateString("fa-IR")}</span>}
      </div>
      <div className="mt-8">
        <PostBody body={post.body} />
      </div>
    </article>
  );
}
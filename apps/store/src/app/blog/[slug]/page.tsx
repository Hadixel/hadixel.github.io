import Link from "next/link";
import Image from "next/image";
import { formatJalali } from "@kmodern/contracts";
import { notFound } from "next/navigation";
import { getPublishedPost } from "@/lib/queries";
import PostBody from "@/content/components/post-body";

export const dynamic = "force-dynamic";

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-semibold text-ash transition-colors hover:text-ink">
        <span aria-hidden>→</span>
        بازگشت به مجله
      </Link>
      <header className="mt-8">
        <h1 className="text-balance font-display text-3xl font-black leading-tight text-ink sm:text-5xl">{post.title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ash">
          <span>{post.byline ?? "خانه مدرن"}</span>
          {post.publishAt && <><span aria-hidden>·</span><span>{formatJalali(new Date(post.publishAt))}</span></>}
        </div>
      </header>
      {post.coverImage && (
        <div className="relative mt-8 aspect-[16/8] overflow-hidden rounded-card bg-plaster">
          <Image src={post.coverImage} alt={post.title} fill sizes="(max-width:768px) 100vw, 768px" className="object-cover" />
        </div>
      )}
      <div className="mt-10">
        <PostBody body={post.body} />
      </div>
    </article>
  );
}

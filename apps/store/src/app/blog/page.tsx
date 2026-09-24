import Link from "next/link";
import Image from "next/image";
import { getPublishedPosts } from "@/lib/queries";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  const posts = await getPublishedPosts(20);
  if (posts.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <EmptyState title="هنوز مطلبی منتشر نشده است" description="مطالب آموزشی و راهنمای محصولات به‌زودی در این بخش منتشر می‌شوند." action={{ label: "مشاهده محصولات", href: "/products" }} />
      </div>
    );
  }

  const [featured, ...rest] = posts;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <PageHeader title="مجله خانه مدرن" description="راهنماهای انتخاب، نصب و نگهداری لوازم خانگی." />

      <Link href={`/blog/${featured.slug}`} className="group grid overflow-hidden rounded-card bg-plaster transition-colors hover:bg-fog/60 lg:grid-cols-[1.15fr_.85fr]">
        <div className="relative min-h-72 overflow-hidden bg-canvas lg:min-h-[420px]">
          {featured.coverImage && <Image src={featured.coverImage} alt={featured.title} fill sizes="(max-width:1024px) 100vw, 58vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transform-none" />}
          {!featured.coverImage && <div className="flex h-full items-center justify-center text-sm text-slate-line">بدون تصویر</div>}
        </div>
        <div className="flex flex-col justify-center p-7 sm:p-10">
          <div className="text-xs text-ash">{featured.publishAt ? new Date(featured.publishAt).toLocaleDateString("fa-IR") : "مقاله تازه"}</div>
          <h2 className="mt-4 text-balance font-display text-2xl font-black leading-tight text-ink sm:text-3xl">{featured.title}</h2>
          {featured.excerpt && <p className="mt-4 line-clamp-3 text-sm leading-7 text-ash">{featured.excerpt}</p>}
          <span className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-ink">ادامه مطلب <span className="transition-transform group-hover:-translate-x-1 motion-reduce:transform-none" aria-hidden>←</span></span>
        </div>
      </Link>

      {rest.length > 0 && (
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className="group flex h-full flex-col overflow-hidden rounded-card bg-plaster/70 transition-colors hover:bg-plaster">
              <div className="relative aspect-[16/10] overflow-hidden bg-canvas">
                {post.coverImage && <Image src={post.coverImage} alt={post.title} fill sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transform-none" />}
              </div>
              <div className="flex flex-1 flex-col p-5">
                <div className="text-xs text-ash">{post.publishAt ? new Date(post.publishAt).toLocaleDateString("fa-IR") : ""}</div>
                <h2 className="mt-3 line-clamp-2 text-base font-bold leading-7 text-ink">{post.title}</h2>
                {post.excerpt && <p className="mt-3 line-clamp-2 text-sm leading-7 text-ash">{post.excerpt}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

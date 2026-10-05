import Link from "next/link";
import Image from "next/image";
import { formatJalali, toFaDigits } from "@kmodern/contracts";
import { cn } from "@kmodern/ui";

/* The teaser card reads the same Prisma row the /blog listing reads, and takes
   the fields it needs rather than the rest (body, seo, tags). It is not shared
   with that listing — the listing draws its own card — so this one is built for
   a rail, and reads as a teaser on a phone: media, date, title and link, with
   the excerpt appearing from `sm` up where there is room for it. */
export type PostCardPost = {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  coverImage?: string | null;
  publishAt?: Date | string | null;
  category?: string | null;
  readingTimeMinutes?: number | null;
};


function PlaceholderMark() {
  return (
    <span aria-hidden className="absolute inset-0 grid place-items-center bg-plaster text-fog">
      <svg
        className="size-9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
        <path d="M14 3v3a2 2 0 0 0 2 2h3" />
        <path d="M9 13h6M9 17h4" />
      </svg>
    </span>
  );
}

export function PostCard({
  post,
  sizes,
  priority = false,
  className,
}: {
  post: PostCardPost;
  /* Required: the card is laid out at two different widths (a 38% rail card
     below `sm`, a grid card above), and a silent default is how a rail ends up
     fetching full-width art. The caller knows its own layout, so it declares. */
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  /* Slugs are unique, so the title id is stable without a client-side useId. */
  const titleId = `post-card-title-${post.slug}`;
  const publishedAt = post.publishAt ? new Date(post.publishAt) : null;
  const reading = post.readingTimeMinutes ? `${toFaDigits(post.readingTimeMinutes)} دقیقه مطالعه` : null;
  const meta = [post.category, reading].filter(Boolean);

  return (
    <Link
      href={`/blog/${post.slug}`}
      aria-labelledby={titleId}
      className={cn(
        /* The hairline is what makes this read as a card on plaster; the shadow only lifts it. */
        "group flex h-full min-w-0 flex-col overflow-hidden rounded-card border border-fog bg-plaster/60 shadow-[0_1px_2px_rgba(17,17,17,0.05)] transition-[background-color,border-color,box-shadow] duration-300 hover:border-slate-line hover:bg-plaster hover:shadow-[0_6px_20px_rgba(17,17,17,0.07)]",
        className,
      )}
    >
      {/* One aspect ratio across the row, cover or not, so every card's media
          ends on the same line. */}
      <div className="relative aspect-[16/9] overflow-hidden bg-plaster">
        {post.coverImage ? (
          <Image
            src={post.coverImage}
            alt={post.title}
            fill
            sizes={sizes}
            priority={priority}
            /* A slow push-in, nothing that moves the card in the grid. The reset and
               the scale guard are both set so reduced motion wins over the hover
               utility. */
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transform-none motion-reduce:scale-100"
          />
        ) : (
          <PlaceholderMark />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-2.5 sm:p-5">
        {(publishedAt || meta.length > 0) && (
          <div className="flex min-w-0 items-center justify-between gap-x-3 text-[11px] text-ash sm:text-xs">
            {publishedAt ? (
              <time dateTime={publishedAt.toISOString()} className="min-w-0 truncate">
                {formatJalali(publishedAt)}
              </time>
            ) : (
              <span />
            )}
            {meta.length > 0 && (
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{meta[0]}</span>
                {meta[1] && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="shrink-0">{meta[1]}</span>
                  </>
                )}
              </span>
            )}
          </div>
        )}

        <h3 id={titleId} className="mt-1.5 line-clamp-2 text-pretty font-display text-sm font-black leading-6 text-ink sm:mt-3 sm:text-lg sm:leading-8">
          {post.title}
        </h3>

        {post.excerpt && (
          <p className="mt-2 line-clamp-2 text-pretty text-sm leading-7 text-ash sm:mt-3 hidden sm:block">{post.excerpt}</p>
        )}

        <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-xs font-bold text-ash transition-colors group-hover:text-ink sm:pt-6">
          ادامه مطلب
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5 rtl:-scale-x-100 transition-transform duration-300 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 motion-reduce:transform-none"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </span>
      </div>
    </Link>
  );
}

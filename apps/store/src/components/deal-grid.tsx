import Link from "next/link";
import Image from "next/image";
import { formatToman, toFaDigits } from "@kmodern/schema/format";
import { CountdownTimer } from "./countdown-timer";
import { EmptyState } from "./empty-state";
import { AnimatedContent } from "./reactbits";
import type { ActiveDeal } from "@/lib/queries";

function SaleTagIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.6 13.4 12 22l-9-9V4h9l8.6 8.6a1.4 1.4 0 0 1 0 2Z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </svg>
  );
}

function SalePercentIcon() {
  return (
    <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d="M19 5 5 19" />
      <circle cx="7" cy="7" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="17" cy="17" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* Special offers — ink band so the section reads as an event, not another
   product row. The savings are the headline; the original price is struck
   through and the discounted price leads. */
export function DealGrid({
  deals,
  title,
  subtitle,
  emptyText,
}: {
  deals: ActiveDeal[];
  title: string;
  subtitle?: string;
  emptyText?: string;
}) {
  if (deals.length === 0) {
    return emptyText ? <EmptyState title={emptyText} description="همین حالا پیشنهاد تخفیف‌داری ثبت نشده است." compact /> : null;
  }

  // `endsAt` crosses JSON as an ISO string, so it is parsed once here rather than at every use. The
  // narrowing is on `string`, not on `Date`: filtering a `Date | null` and then calling `getTime` on it
  // is the shape that a type predicate written for the old wire type silently broke.
  const endsAt = deals
    .map((deal) => deal.endsAt)
    .filter((instant): instant is string => typeof instant === "string" && instant !== "");
  const soonest = endsAt.length
    ? new Date(Math.min(...endsAt.map((instant) => new Date(instant).getTime())))
    : null;

  return (
    <section aria-label={title}>
      <div className="rounded-card bg-ink px-5 py-9 sm:px-8 sm:py-11">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="mb-3 inline-flex items-center gap-2 text-flame-600">
              <SaleTagIcon />
              <span className="text-[11px] font-bold tracking-[0.2em]">SPECIAL OFFER</span>
            </span>
            <h2 className="font-display text-2xl font-extrabold text-white sm:text-3xl">{title}</h2>
            {subtitle && <p className="mt-2 max-w-[36rem] text-sm leading-7 text-white/55">{subtitle}</p>}
          </div>
          {soonest && (
            <div className="rounded-card border border-white/10 px-4 py-2.5 text-center">
              <div className="mb-1 text-[11px] font-bold text-white/45">پایان این پیشنهاد</div>
              <CountdownTimer endsAt={soonest.toISOString()} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {deals.map((deal, index) => (
            <AnimatedContent key={deal.product.id} delay={Math.min(index, 7) * 60} distance={20} className="h-full">
              <article className="group relative flex h-full flex-col overflow-hidden rounded-card bg-canvas">
                <span className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-[30px] bg-flame-700 py-1 pe-2.5 ps-1.5 text-[11px] font-bold text-white">
                  <SalePercentIcon />
                  {toFaDigits(deal.label)}
                </span>
                <Link href={`/product/${deal.product.slug}`} className="flex min-w-0 flex-1 flex-col">
                  <div className="relative aspect-square overflow-hidden bg-plaster">
                    {deal.product.image && (
                      <Image
                        src={deal.product.image}
                        alt={deal.product.name}
                        fill
                        sizes="(max-width:640px) 50vw, 25vw"
                        className="object-contain p-4 mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.05] motion-reduce:transform-none"
                      />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col p-4">
                    <h3 className="line-clamp-2 min-h-10 text-sm font-bold leading-snug text-ink">{deal.product.name}</h3>
                    <div className="mt-2 flex flex-wrap items-baseline gap-2">
                      <span className="font-display text-lg font-black tabular-nums text-ink">
                        {formatToman(deal.discountedPrice)}
                      </span>
                      <s className="text-xs tabular-nums text-slate-line">{formatToman(deal.product.price)}</s>
                    </div>
                  </div>
                </Link>
              </article>
            </AnimatedContent>
          ))}
        </div>
      </div>
    </section>
  );
}

import Link from "next/link";
import Image from "next/image";
import { formatToman, toFaDigits } from "@kmodern/contracts/format";
import { ShinyText } from "@kmodern/ui";
import { CountdownTimer } from "@/home/components/countdown-timer";
import { EmptyState } from "@/components/empty-state";
import { AnimatedContent } from "@/components/reactbits/index";
import type { ActiveDeal } from "@/lib/queries";

function SaleTagIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.6 13.4 12 22l-9-9V4h9l8.6 8.6a1.4 1.4 0 0 1 0 2Z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </svg>
  );
}

/* Special offers — ink band so the section reads as an event, not another
   product row. The savings are the headline; the original price is struck
   through and the discounted price leads. */
export function DealGrid({
  deals,
  title,
  emptyText,
}: {
  deals: ActiveDeal[];
  title: string;
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
      <div className="relative overflow-hidden rounded-card bg-ink px-4 py-5 sm:px-8 sm:py-8">
        {/* Event glow: a lit top edge plus flame halos so the panel reads as
            a stage, not a black box. All decorative, clipped by the panel. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-l from-transparent via-flame-500/70 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute -top-24 start-1/4 h-48 w-72 rounded-full bg-flame-600/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 end-0 h-56 w-56 rounded-full bg-flame-600/10 blur-3xl" />
        <div className="relative mb-5 flex flex-col gap-4 sm:mb-7">
          {/* Latin-only label, so the sheen never crosses Persian joining */}
          <span className="inline-flex w-fit items-center gap-1.5 self-start rounded-pill border border-white/10 bg-white/5 px-2.5 py-1 text-flame-400">
            <SaleTagIcon />
            <ShinyText text="SPECIAL OFFER" className="text-micro font-bold tracking-[0.2em]" color="var(--color-flame-400)" shineColor="var(--color-flame-100)" />
          </span>
          <div className="flex items-center justify-between gap-3 sm:gap-4">
            <h2 className="whitespace-nowrap font-display text-2xl font-extrabold leading-tight text-white sm:text-3xl">{title}</h2>
            {soonest && <CountdownTimer endsAt={soonest.toISOString()} tone="on-ink" />}
          </div>
        </div>
        <div aria-hidden className="relative mb-5 h-px bg-gradient-to-l from-transparent via-white/15 to-transparent sm:mb-7" />

        {/* Rail on phones (see `.section-rail`), four columns from sm up. */}
        <div className="section-rail -mx-4 grid grid-cols-2 gap-3 px-4 sm:mx-0 sm:gap-4 sm:px-0 lg:grid-cols-3 xl:grid-cols-4">
          {deals.map((deal, index) => (
            <AnimatedContent key={deal.product.id} delay={Math.min(index, 7) * 60} distance={20} className="section-rail-item section-rail-item-deal h-full">
              <article className="group relative flex h-full flex-col overflow-hidden rounded-card bg-canvas">
                <Link href={`/product/${deal.product.slug}`} className="flex min-w-0 flex-1 flex-col">
                  {/* 3:2 on a phone, the desktop square from `sm` up — wide
                      enough to keep the rail compact instead of towering,
                      tall enough that the appliance still reads as a product
                      shot rather than a banner. */}
                  <div className="relative aspect-[3/2] overflow-hidden bg-plaster sm:aspect-square">
                    <span className="absolute left-2 top-2 z-10 inline-flex items-center rounded-pill bg-flame-700 px-2.5 py-1 text-micro font-bold text-white">
                      {toFaDigits(deal.label)}
                    </span>
                    {deal.product.image && (
                      <Image
                        src={deal.product.image}
                        alt={deal.product.name}
                        fill
                        sizes="(max-width:640px) 40vw, 25vw"
                        className="object-contain p-2 mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.05] motion-reduce:transform-none sm:p-4"
                      />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col p-2 sm:p-4">
                    <h3 className="line-clamp-2 min-h-8 text-[13px] font-bold leading-snug text-ink sm:min-h-10 sm:text-sm">{deal.product.name}</h3>
                    {/* The saving pill lives on the image corner; in the price row the
                        struck original sits above the discounted price it was cut to, so the
                        two read as one figure instead of a wrapped baseline pair. */}
                    <div className="mt-1.5 flex items-center gap-2 sm:mt-2">
                      <span className="flex min-w-0 flex-col items-start">
                        <s className="text-[11px] tabular-nums text-slate-line sm:text-xs">{formatToman(deal.product.price)}</s>
                        <span className="font-display text-base font-black tabular-nums text-ink sm:text-lg">
                          {formatToman(deal.discountedPrice)}
                        </span>
                      </span>
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

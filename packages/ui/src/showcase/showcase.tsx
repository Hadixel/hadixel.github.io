import { cn } from "../cn";
import { Badge } from "../components/badge";
import { toFaDigits } from "@kmodern/schema";

/*
 * Credit mark — the 40x40 white دیتیس chip anchoring product-card metadata.
 * Carries the real Datees logo; multiply blend keeps it matte on plaster.
 */
export function CreditMark({ className }: { className?: string }) {
  return (
    <span className={cn("relative block size-10 shrink-0 overflow-hidden rounded-[6px] border border-plaster bg-canvas", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny third-party mark, blend needs raw img */}
      <img src="/icons/logo.png" alt="دیتیس" className="absolute inset-0 size-full object-contain p-1 mix-blend-multiply" />
    </span>
  );
}

/* Section header — title right (RTL), optional hairline arrow controls left. */
export function SectionHeader({
  title,
  seeAllHref,
  className,
}: {
  title: string;
  seeAllHref?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex items-center justify-between", className)}>
      <h2 className="text-xl font-bold text-ink">{title}</h2>
      {seeAllHref && (
        <a
          href={seeAllHref}
          className="rounded-card border border-plaster bg-canvas px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-plaster"
        >
          مشاهده همه
        </a>
      )}
    </div>
  );
}

/* Status badges — Persian retail states in the token system (fill-only differentiation). */
export function NewBadge({ className }: { className?: string }) {
  return (
    <Badge variant="flame" className={cn("absolute top-3 left-3 z-10", className)}>
      جدید
    </Badge>
  );
}

export function SoldOutBadge({ className }: { className?: string }) {
  return (
    <Badge variant="slate" className={cn("absolute top-3 left-3 z-10", className)}>
      ناموجود
    </Badge>
  );
}

/* Announcement strip — ink full-bleed, one flame spark allowed. */
export function AnnouncementStrip({ text, spark }: { text: string; spark?: string }) {
  return (
    <div className="bg-ink text-stone-300">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-xs">
        <span>{text}</span>
        {spark && <span className="font-semibold text-flame-500">{spark}</span>}
      </div>
    </div>
  );
}

/* Ranked numeral watermark — giant translucent Persian digit, top of card. */
export function RankNumeral({ rank, className }: { rank: number; className?: string }) {
  const fa = toFaDigits(String(rank));
  return (
    <span
      aria-hidden
      className={cn(
        // ink at low opacity — legible on plaster, exactly the reference's
        // watermark treatment (theirs is white on their darker card art)
        "pointer-events-none absolute top-2 left-3 z-10 select-none text-[150px] leading-none font-black text-ink/10",
        className,
      )}
    >
      {fa}

    </span>
  );
}

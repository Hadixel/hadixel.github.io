import { cn } from "../cn";
import { Badge } from "../components/badge";
import { toFaDigits } from "@kmodern/contracts";

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

/* Ranked numeral watermark — giant translucent Persian digit, top of card.
   Anchored to the logical start (right on this RTL page) per the "top-right"
   treatment, and stepped so it keeps the same ~40-48% of card at every
   breakpoint: a phone rail card is ~136px (so 64px), the two-up listing card
   ~170px, sm/lg grid cards 236-300px (so 104px — 150px there would be 64% of
   the card, the original complaint at another width), and the wide desktop
   card ~312-340px (150px). Mobile also gets a slightly stronger ink so the
   smaller digit still reads as the rank cue. */
export function RankNumeral({ rank, className }: { rank: number; className?: string }) {
  const fa = toFaDigits(String(rank));
  return (
    <span
      aria-hidden
      className={cn(
        // ink at low opacity — legible on plaster, exactly the reference's
        // watermark treatment (theirs is white on their darker card art)
        "pointer-events-none absolute top-1.5 start-2 z-10 select-none text-[64px] leading-none font-black text-ink/15 sm:top-2 sm:start-3 sm:text-[104px] sm:text-ink/10 xl:text-[150px]",
        className,
      )}
    >
      {fa}

    </span>
  );
}

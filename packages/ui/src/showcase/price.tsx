import { toFaDigits } from "@kmodern/contracts";
import { cn } from "../cn";

/*
 * Price — Persian digits, tabular so columns align (CONTEXT.md "Design tokens").
 * Range form: "X تا Y" for variant spans. Text parts may be Persian; digits always are.
 *
 * `tone` exists for one moment only: a discounted card's lead price. GLOSSARY.md
 * keeps flame blue for "activation and current state", and a live price cut *is*
 * the card's current state — which is why the same sale spends flame twice on
 * one card (the tinted plate behind the cut-out and this lead). Everywhere else
 * the ink lead keeps the monochrome reading.
 */
export function Price({
  amount,
  maxAmount,
  tone = "ink",
  className,
}: {
  amount: number;
  /** when present, renders a range "از amount" (variant span) */
  maxAmount?: number;
  /** `"flame"` for the discounted lead; ink for every other price. */
  tone?: "ink" | "flame";
  className?: string;
}) {
  const fa = (n: number) => toFaDigits(new Intl.NumberFormat("fa-IR").format(n));
  const isRange = maxAmount != null && maxAmount !== amount;

  return (
    <span
      className={cn(
        "text-price tabular-nums",
        isRange
          ? "inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 gap-y-0.5 leading-snug font-semibold text-xs sm:text-sm lg:text-base"
          : "inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 gap-y-0.5 leading-snug font-semibold text-sm sm:text-base lg:text-lg",
        tone === "flame" ? "text-flame-700" : "text-ink",
        className,
      )}
    >
      {isRange ? (
        <>
          <span className="inline-flex items-baseline gap-x-1 whitespace-nowrap">
            <span>{fa(amount)}</span>
            <span className="text-[11px] sm:text-xs font-medium text-ash">تا</span>
          </span>
          <span className="inline-flex items-baseline gap-x-1 whitespace-nowrap">
            <span>{fa(maxAmount)}</span>
            <span className="text-[11px] sm:text-xs font-normal text-ash">تومان</span>
          </span>
        </>
      ) : (
        <>
          <span className="whitespace-nowrap">{fa(amount)}</span>
          <span className="text-xs font-normal text-ash whitespace-nowrap">تومان</span>
        </>
      )}
    </span>
  );
}

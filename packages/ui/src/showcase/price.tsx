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
  return (
    <span
      className={cn(
        "text-price whitespace-nowrap",
        tone === "flame" ? "text-flame-700" : "text-ink",
        className,
      )}
    >
      {maxAmount != null && maxAmount !== amount ? (
        <>
          {fa(amount)} <span className="text-ash">تا</span> {fa(maxAmount)}
        </>
      ) : (
        fa(amount)
      )}
      <span className="ms-1 text-xs font-normal text-ash">تومان</span>
    </span>
  );
}

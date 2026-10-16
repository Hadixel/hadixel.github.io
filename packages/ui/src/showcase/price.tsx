import { toFaDigits } from "@kmodern/contracts";
import { cn } from "../cn";

/*
 * Price — Persian digits, tabular so columns align (CONTEXT.md "Design tokens").
 * Range form: "X تا Y" for variant spans. Text parts may be Persian; digits always are.
 */
export function Price({
  amount,
  maxAmount,
  className,
  tone = "ink",
}: {
  amount: number;
  /** when present, renders a range "از amount" (variant span) */
  maxAmount?: number;
  className?: string;
  tone?: "ink" | "flame";
}) {
  const fa = (n: number) => toFaDigits(new Intl.NumberFormat("fa-IR").format(n));
  const color = tone === "flame" ? "text-flame-700" : "text-ink";
  return (
    <span className={cn("text-price whitespace-nowrap", color, className)}>
      {maxAmount != null && maxAmount !== amount ? (
        <>
          {fa(amount)} <span className="text-ash">تا</span> {fa(maxAmount)}
        </>
      ) : (
        fa(amount)
      )}
      <span className="mr-1 text-xs font-normal text-ash">تومان</span>
    </span>
  );
}

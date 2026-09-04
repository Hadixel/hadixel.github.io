import { toFaDigits } from "@kmodern/schema";
import { cn } from "../cn";

/*
 * Price — Persian digits, tabular so columns align (CONTEXT.md "Design tokens").
 * Range form: "X تا Y" for variant spans. Text parts may be Persian; digits always are.
 */
export function Price({
  amount,
  maxAmount,
  className,
}: {
  amount: number;
  /** when present, renders a range "از amount" (variant span) */
  maxAmount?: number;
  className?: string;
}) {
  const fa = (n: number) => toFaDigits(new Intl.NumberFormat("fa-IR").format(n));
  return (
    <span className={cn("text-price whitespace-nowrap text-ink", className)}>
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

import { toFaDigits } from "@kmodern/contracts";

/** One number in a `<dl>` of run metrics. `danger` is the operator's "this should be zero" flag. */
export function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ash">{label}</dt>
      <dd className={`mt-1 text-price ${danger ? "text-red-700" : "text-ink"}`}>{toFaDigits(value)}</dd>
    </div>
  );
}

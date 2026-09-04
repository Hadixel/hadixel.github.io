"use client";

import Link from "next/link";
import { useCart } from "./cart-provider";
import { toFaDigits } from "@kmodern/schema";

/*
 * Cart trigger — nav pill: white surface, ink hairline (Zellerfeld nav
 * pill anatomy). The count badge carries the single flame spark.
 */
export function CartButton() {
  const { count } = useCart();
  return (
    <Link
      href="/cart"
      className="relative flex items-center gap-1.5 rounded-card border border-ink px-3.5 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-plaster"
    >
      <span>سبد خرید</span>
      {count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-[30px] bg-flame-700 px-1 text-xs font-bold text-white">
          {toFaDigits(count)}
        </span>
      )}
    </Link>
  );
}

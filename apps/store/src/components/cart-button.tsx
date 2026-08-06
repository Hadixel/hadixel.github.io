"use client";

import Link from "next/link";
import { useCart } from "./cart-provider";
import { toFaDigits } from "@kmodern/schema";

export function CartButton() {
  const { count } = useCart();
  return (
    <Link href="/cart" className="relative flex items-center gap-1 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
      <span>سبد خرید</span>
      {count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-bold text-slate-900">
          {toFaDigits(count)}
        </span>
      )}
    </Link>
  );
}
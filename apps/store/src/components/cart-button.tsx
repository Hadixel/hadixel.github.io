"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "./cart-provider";
import { toFaDigits } from "@kmodern/schema";

function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

/*
 * Cart trigger — nav icon on all sizes (Showcase stroke set). The count
 * badge carries the single flame spark.
 */
export function CartButton() {
  const { count } = useCart();
  return (
    <Link
      href="/cart"
      aria-label="سبد خرید"
      className="relative flex size-9 items-center justify-center rounded-card text-ink transition-colors hover:bg-plaster"
    >
      <CartIcon />
      {count > 0 && (
        <span className="absolute -top-0.5 -left-0.5 flex h-5 min-w-5 items-center justify-center rounded-[30px] bg-flame-700 px-1 text-xs font-bold text-white">
          {toFaDigits(count)}
        </span>
      )}
    </Link>
  );
}

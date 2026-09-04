"use client";

import Link from "next/link";
import { useCart } from "./cart-provider";
import { toFaDigits } from "@kmodern/schema";
import { Button } from "@kmodern/ui";

export function CartButton() {
  const { count } = useCart();
  return (
    <Button asChild>
      <Link href="/cart" className="relative">
        <span>سبد خرید</span>
        {count > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-[30px] bg-canvas px-1 text-xs font-extrabold text-flame-800">
            {toFaDigits(count)}
          </span>
        )}
      </Link>
    </Button>
  );
}

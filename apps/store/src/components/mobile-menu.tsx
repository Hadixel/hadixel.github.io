"use client";

import Link from "next/link";
import { useState } from "react";
import type { NavNode } from "@/lib/nav";

/* Mobile drawer — grid icon opens it. Same hairline language. */
export default function MobileMenu({ tree }: { tree: NavNode[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        aria-label="منو"
        onClick={() => setOpen(true)}
        className="flex size-9 items-center justify-center rounded-card text-ink hover:bg-plaster lg:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
          {[0, 7, 14].map((y) =>
            [0, 7, 14].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" rx="1" />),
          )}
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-ink/50" onClick={() => setOpen(false)}>
          <div className="h-full w-72 max-w-[85%] overflow-y-auto bg-canvas p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between border-b border-plaster pb-3">
              <span className="font-black text-ink">منو</span>
              <button aria-label="بستن" onClick={() => setOpen(false)} className="rounded-card p-2 hover:bg-plaster">✕</button>
            </div>
            <nav className="space-y-1">
              {tree.map((item) => (
                <div key={item.id}>
                  <Link href={item.href} onClick={() => setOpen(false)} className="block rounded-card px-3 py-2.5 font-semibold text-ink hover:bg-plaster">
                    {item.label}
                  </Link>
                  {item.children.map((c) => (
                    <Link key={c.id} href={c.href} onClick={() => setOpen(false)} className="block rounded-card px-6 py-1.5 text-sm text-ash hover:bg-plaster hover:text-ink">
                      {c.label}
                    </Link>
                  ))}
                </div>
              ))}
              <Link href="/products" onClick={() => setOpen(false)} className="block rounded-card px-3 py-2.5 font-semibold text-flame-700 hover:bg-flame-50">
                همه محصولات
              </Link>
              <Link href="/account" onClick={() => setOpen(false)} className="block rounded-card px-3 py-2.5 font-semibold text-ink hover:bg-plaster">
                حساب من
              </Link>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

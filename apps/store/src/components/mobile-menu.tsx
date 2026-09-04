"use client";

import Link from "next/link";
import { useState } from "react";
import type { NavNode } from "@/lib/nav";

export default function MobileMenu({ tree }: { tree: NavNode[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button aria-label="منو" onClick={() => setOpen(true)} className="rounded-card p-2 hover:bg-plaster">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-ink/50" onClick={() => setOpen(false)}>
          <div className="h-full w-72 max-w-[85%] overflow-y-auto bg-canvas p-4 shadow-[0_8px_24px_rgba(0,0,0,0.15)]" onClick={(e) => e.stopPropagation()}>
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

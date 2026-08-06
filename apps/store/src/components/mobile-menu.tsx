"use client";

import Link from "next/link";
import { useState } from "react";
import type { NavNode } from "@/lib/nav";

export default function MobileMenu({ tree }: { tree: NavNode[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button aria-label="منو" onClick={() => setOpen(true)} className="rounded p-2 hover:bg-gray-100">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setOpen(false)}>
          <div className="h-full w-72 max-w-[85%] overflow-y-auto bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <span className="font-bold">منو</span>
              <button onClick={() => setOpen(false)} className="rounded p-2 hover:bg-gray-100">✕</button>
            </div>
            <nav className="space-y-1">
              {tree.map((item) => (
                <div key={item.id}>
                  <Link href={item.href} onClick={() => setOpen(false)} className="block rounded px-3 py-2 font-medium hover:bg-gray-50">
                    {item.label}
                  </Link>
                  {item.children.map((c) => (
                    <Link key={c.id} href={c.href} onClick={() => setOpen(false)} className="block rounded px-6 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                      {c.label}
                    </Link>
                  ))}
                </div>
              ))}
              <Link href="/account" onClick={() => setOpen(false)} className="block rounded px-3 py-2 font-medium hover:bg-gray-50">
                حساب من
              </Link>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
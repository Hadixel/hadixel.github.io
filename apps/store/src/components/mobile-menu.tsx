"use client";

import Link from "next/link";
import { useState } from "react";
import { Drawer } from "@heroui/react";
import type { NavNode } from "@/lib/nav";

/*
 * Mobile drawer — HeroUI Drawer. The trigger is part of the Drawer root so
 * React Aria receives a real pressable child (rather than a detached button).
 * Content nests inside the Backdrop (ModalOverlay > Modal) for focus and
 * dismissal behavior.
 */
export default function MobileMenu({ tree }: { tree: NavNode[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Drawer isOpen={open} onOpenChange={setOpen}>
      <Drawer.Trigger aria-label="منو" className="flex size-9 items-center justify-center rounded-card text-ink transition-colors hover:bg-plaster lg:hidden">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
          {[0, 7, 14].map((y) =>
            [0, 7, 14].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" rx="1" />),
          )}
        </svg>
      </Drawer.Trigger>
      <Drawer.Backdrop>
        <Drawer.Content placement="left">
          <Drawer.Dialog>
            <Drawer.Header className="mb-4 flex-row items-center justify-between border-b border-plaster pb-3">
              <Drawer.Heading className="font-black text-ink">منو</Drawer.Heading>
              <Drawer.CloseTrigger aria-label="بستن">✕</Drawer.CloseTrigger>
            </Drawer.Header>
            <Drawer.Body>
              <nav className="space-y-1">
                {tree.map((item) => (
                  <div key={item.id} className="border-b border-plaster/70 pb-2 last:border-0">
                    <Link href={item.href} onClick={() => setOpen(false)} className="block rounded-card px-3 py-2.5 font-bold text-ink hover:bg-plaster">
                      {item.label}
                    </Link>
                    {item.children.length > 0 && (
                      <div className="mt-1 space-y-0.5 border-r border-plaster pr-3">
                        {item.children.map((child) => (
                          <Link key={child.id} href={child.href} onClick={() => setOpen(false)} className="block rounded-card px-3 py-2 text-sm text-ash hover:bg-plaster hover:text-ink">
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <Link href="/products" onClick={() => setOpen(false)} className="mt-3 block rounded-card bg-flame-50 px-3 py-2.5 font-bold text-flame-800 hover:bg-flame-100">
                  همه محصولات
                </Link>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link href="/blog" onClick={() => setOpen(false)} className="rounded-card bg-plaster px-3 py-2.5 text-center text-sm font-semibold text-ink">وبلاگ</Link>
                  <Link href="/account" onClick={() => setOpen(false)} className="rounded-card bg-plaster px-3 py-2.5 text-center text-sm font-semibold text-ink">حساب من</Link>
                </div>
              </nav>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}

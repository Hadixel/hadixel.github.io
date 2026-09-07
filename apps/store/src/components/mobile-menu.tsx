"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Drawer } from "@heroui/react";
import type { NavNode } from "@/lib/nav";

/*
 * Mobile drawer — HeroUI Drawer. React Aria renders inside the RTL document,
 * where "left" (justify-start) lands on the physical right edge — the start
 * side of the current Digikala anatomy; verified visually at mobile width.
 * Content nests inside the Backdrop (ModalOverlay > Modal): that is what
 * populates RAC's modalRef, which drives backdrop-press dismissal, Escape,
 * and focus containment.
 */
export default function MobileMenu({ tree }: { tree: NavNode[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        isIconOnly
        variant="ghost"
        aria-label="منو"
        onPress={() => setOpen(true)}
        className="lg:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
          {[0, 7, 14].map((y) =>
            [0, 7, 14].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" rx="1" />),
          )}
        </svg>
      </Button>
      <Drawer isOpen={open} onOpenChange={setOpen}>
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
                <Link href="/blog" onClick={() => setOpen(false)} className="block rounded-card px-3 py-2.5 font-semibold text-ink hover:bg-plaster">
                  وبلاگ
                </Link>
                <Link href="/account" onClick={() => setOpen(false)} className="block rounded-card px-3 py-2.5 font-semibold text-ink hover:bg-plaster">
                  حساب من
                </Link>
                </nav>
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    </>
  );
}

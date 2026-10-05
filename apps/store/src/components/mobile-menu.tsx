"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Drawer } from "@heroui/react";
import { cn } from "@kmodern/ui";
import type { NavNode } from "@/lib/nav";

/*
 * A link is current when the drawer's pathname is exactly it, or sits inside
 * it — /category/kitchen counts for /category. The bare root matches only the
 * home page, never everything.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/*
 * Mobile drawer — HeroUI Drawer. The trigger is part of the Drawer root so
 * React Aria receives a real pressable child (rather than a detached button).
 * Content nests inside the Backdrop (ModalOverlay > Modal) for focus and
 * dismissal behavior.
 */
export default function MobileMenu({ tree }: { tree: NavNode[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const active = (href: string) => isActive(pathname, href);
  return (
    <Drawer isOpen={open} onOpenChange={setOpen}>
      <Drawer.Trigger aria-label={open ? "بستن منو" : "منو"} className="flex size-9 items-center justify-center rounded-card text-ink transition-colors hover:bg-plaster lg:hidden">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          {open ? (
            <path d="M4 4l10 10M14 4L4 14" />
          ) : (
            <>
              <path d="M2.5 4.5h13" />
              <path d="M2.5 9h13" />
              <path d="M2.5 13.5h13" />
            </>
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
                {/* Start of the list in RTL is the right edge — "all products" leads */}
                <Link href="/products" aria-current={active("/products") ? "page" : undefined} onClick={() => setOpen(false)} className={cn("mb-3 block rounded-card px-3 py-2.5 font-bold", active("/products") ? "bg-flame-100 text-flame-900" : "bg-flame-50 text-flame-800 hover:bg-flame-100")}>
                  همه محصولات
                </Link>
                {tree.map((item) => (
                  <div key={item.id} className="border-b border-plaster/70 pb-2 last:border-0">
                    <Link href={item.href} aria-current={active(item.href) ? "page" : undefined} onClick={() => setOpen(false)} className={cn("block rounded-card px-3 py-2.5 font-bold", active(item.href) ? "bg-flame-50 text-flame-800" : "text-ink hover:bg-plaster")}>
                      {item.label}
                    </Link>
                    {item.children.length > 0 && (
                      <div className="mt-1 space-y-0.5 border-r border-plaster pr-3">
                        {item.children.map((child) => (
                          <Link key={child.id} href={child.href} aria-current={active(child.href) ? "page" : undefined} onClick={() => setOpen(false)} className={cn("block rounded-card px-3 py-2 text-sm", active(child.href) ? "bg-flame-50 font-semibold text-flame-800" : "text-ash hover:bg-plaster hover:text-ink")}>
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link href="/blog" aria-current={active("/blog") ? "page" : undefined} onClick={() => setOpen(false)} className={cn("rounded-card px-3 py-2.5 text-center text-sm font-semibold", active("/blog") ? "bg-flame-50 text-flame-800" : "bg-plaster text-ink")}>وبلاگ</Link>
                  <Link href="/account" aria-current={active("/account") ? "page" : undefined} onClick={() => setOpen(false)} className={cn("rounded-card px-3 py-2.5 text-center text-sm font-semibold", active("/account") ? "bg-flame-50 text-flame-800" : "bg-plaster text-ink")}>حساب من</Link>
                </div>
              </nav>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}

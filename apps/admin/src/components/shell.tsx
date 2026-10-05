"use client";

// RTL admin shell: right-side sidebar + topbar. Client component so nav
// links can highlight against usePathname; badge counts are passed from the
// server layout so they never go stale during a session.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
// Persian digits are `@/lib/date`'s helper; `ui.tsx` carried a second implementation of the same
// substitution and this imported that one, so the two could render the same number differently.
import { toFaDigits } from "@kmodern/contracts";

interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={`flex items-center justify-between rounded-card px-3 py-2 text-sm font-semibold transition-colors ${
        active ? "bg-flame-50 text-flame-800" : "text-ink hover:bg-plaster hover:text-ink"
      }`}
    >
      <span>{item.label}</span>
      {item.badge ? (
        <span className="rounded-pill bg-flame-700 px-2 py-0.5 text-xs font-bold text-white">{toFaDigits(item.badge)}</span>
      ) : null}
    </Link>
  );
}

function NavGroup({
  label,
  items,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const containsActive = items.some((i) => isActive(pathname, i.href));
  const [expanded, setExpanded] = useState(containsActive);
  const visible = containsActive || expanded;

  // A client-side navigation can enter a collapsed group. Keep the active
  // section visible instead of making the user discover and open it manually.
  useEffect(() => {
    if (containsActive) setExpanded(true);
  }, [containsActive]);

  return (
    <div className="mb-1">
      <button
        type="button"
        aria-expanded={visible}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between rounded-card px-3 py-2 text-sm font-medium text-ink hover:bg-plaster hover:text-ink"
      >
        <span>{label}</span>
        <span aria-hidden="true" className="text-xs text-ash">{visible ? "▾" : "▴"}</span>
      </button>
      {visible && (
        <div className="mr-3 mt-1 space-y-0.5 border-r border-plaster pr-2">
          {items.map((i) => (
            <NavLink key={i.href} item={i} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  ordersAwaiting,
  lowStock,
  isOwner,
  mobileOpen = false,
  onClose,
  sidebarRef,
}: {
  ordersAwaiting: number;
  lowStock: number;
  isOwner: boolean;
  mobileOpen?: boolean;
  onClose?: () => void;
  sidebarRef?: React.Ref<HTMLElement>;
}) {
  return (
    <aside
      ref={sidebarRef}
      aria-label="ناوبری اصلی"
      className={`fixed inset-y-0 right-0 z-30 w-64 max-w-[85vw] flex-col border-l border-plaster bg-white shadow-xl md:flex md:shadow-none ${
        mobileOpen ? "flex" : "hidden"
      }`}
    >
      <Link href="/" onClick={onClose} className="flex h-16 items-center gap-2 border-b border-plaster px-5">
        <span className="text-lg font-black text-ink">کمدرن</span>
        <span className="text-sm text-ash">پنل مدیریت</span>
      </Link>
      <nav className="flex-1 overflow-y-auto p-3">
        <NavLink item={{ href: "/", label: "داشبورد" }} onNavigate={onClose} />
        <NavLink item={{ href: "/orders", label: "سفارش‌ها", badge: ordersAwaiting }} onNavigate={onClose} />
        <NavGroup
          label="کاتالوگ"
          onNavigate={onClose}
          items={[
            { href: "/products", label: "محصولات" },
            { href: "/categories", label: "دسته‌بندی‌ها" },
            { href: "/collections", label: "مجموعه‌ها" },
            ...(isOwner
              ? [
                  { href: "/scraper", label: "اسکرپر کاتالوگ" },
                  { href: "/price-watch", label: "نظارت قیمت" },
                ]
              : []),
          ]}
        />
        <NavLink item={{ href: "/inventory", label: "موجودی", badge: lowStock }} onNavigate={onClose} />
        <NavLink item={{ href: "/customers", label: "مشتریان" }} onNavigate={onClose} />
        <NavGroup
          label="محتوا"
          onNavigate={onClose}
          items={[
            { href: "/pages", label: "صفحات" },
            { href: "/blog", label: "وبلاگ" },
            { href: "/navigation", label: "ناوبری" },
            { href: "/media", label: "رسانه" },
          ]}
        />
        <NavLink item={{ href: "/discounts", label: "تخفیف‌ها" }} onNavigate={onClose} />
        <NavLink item={{ href: "/settings", label: "تنظیمات" }} onNavigate={onClose} />
        <NavLink item={{ href: "/audit", label: "ممیزی" }} onNavigate={onClose} />
      </nav>
      <div className="border-t border-plaster p-3 text-xs text-ash">کمدرن © ۱۴۰۴</div>
    </aside>
  );
}

export function Topbar({
  name,
  email,
  onMenuClick,
  mobileOpen = false,
}: {
  name: string;
  email: string;
  onMenuClick?: () => void;
  mobileOpen?: boolean;
}) {
  const pathname = usePathname();
  const titles: Array<[string, string]> = [
    ["/orders", "سفارش‌ها"],
    ["/products", "محصولات"],
    ["/categories", "دسته‌بندی‌ها"],
    ["/collections", "مجموعه‌ها"],
    ["/scraper", "اسکرپر کاتالوگ"],
    ["/inventory", "موجودی"],
    ["/customers", "مشتریان"],
    ["/pages", "صفحات"],
    ["/blog", "وبلاگ"],
    ["/navigation", "ناوبری"],
    ["/media", "رسانه"],
    ["/discounts", "تخفیف‌ها"],
    ["/settings", "تنظیمات"],
    ["/audit", "ممیزی"],
    ["/login", "ورود"],
  ];
  // longest-prefix match so detail routes (/products/[id]) inherit the section title
  const title =
    [...titles]
      .sort((a, b) => b[0].length - a[0].length)
      .find(([p]) => pathname === p || pathname.startsWith(p + "/"))?.[1]
    ?? (pathname === "/" ? "داشبورد" : "");
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-plaster bg-white/95 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="باز کردن منوی اصلی"
            aria-expanded={mobileOpen}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-card border border-fog text-lg text-ink hover:bg-plaster md:hidden"
          >
            <span aria-hidden="true">☰</span>
          </button>
        )}
        <h1 className="truncate text-lg font-semibold text-ink">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <span className="hidden text-sm text-ash sm:inline">{name}</span>
        <span className="hidden max-w-[12rem] truncate text-xs text-ash sm:inline" dir="ltr" title={email}>{email}</span>
        <form action="/logout" method="post">
          <button type="submit" className="form-control-compact text-ink hover:bg-plaster">
            خروج
          </button>
        </form>
      </div>
    </header>
  );
}

export function AdminShell({
  ordersAwaiting,
  lowStock,
  isOwner,
  name,
  email,
  children,
}: {
  ordersAwaiting: number;
  lowStock: number;
  isOwner: boolean;
  name: string;
  email: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (mobileOpen) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      requestAnimationFrame(() => sidebarRef.current?.querySelector<HTMLElement>("a,button")?.focus());
      return;
    }
    previousFocus.current?.focus();
    previousFocus.current = null;
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);

  return (
    // White canvas, plaster cards. `Card` is a plaster plinth and the design system separates by
    // surface stepping rather than by shadow, which only works if the canvas is the lighter of the
    // two. This wrapper was plaster — the same colour as every card on the page — so each card was
    // invisible against the surface it sat on and the panel read as one continuous grey column
    // however many cards it held. The storefront's canvas is white for the same reason.
    <div className="min-h-screen bg-canvas">
      <Sidebar
        ordersAwaiting={ordersAwaiting}
        lowStock={lowStock}
        isOwner={isOwner}
        sidebarRef={sidebarRef}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      {mobileOpen && (
        <button
          type="button"
          aria-label="بستن منوی اصلی"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-20 bg-ink/40 md:hidden"
        />
      )}
      <div className="md:mr-64">
        <Topbar
          name={name}
          email={email}
          mobileOpen={mobileOpen}
          onMenuClick={() => setMobileOpen((open) => !open)}
        />
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

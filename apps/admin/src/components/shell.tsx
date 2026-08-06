"use client";

// RTL admin shell: right-side sidebar + topbar. Client component so nav
// links can highlight against usePathname; badge counts are passed from the
// server layout so they never go stale during a session.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { faDigits } from "./ui";

interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-rose-50 text-rose-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <span>{item.label}</span>
      {item.badge ? (
        <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">{faDigits(item.badge)}</span>
      ) : null}
    </Link>
  );
}

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname();
  const open = items.some((i) => isActive(pathname, i.href));
  const [expanded, setExpanded] = useState(open);
  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        <span>{label}</span>
        <span className="text-xs text-slate-400">{expanded ? "▾" : "▴"}</span>
      </button>
      {expanded && (
        <div className="mr-3 mt-1 space-y-0.5 border-r border-slate-200 pr-2">
          {items.map((i) => (
            <NavLink key={i.href} item={i} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  ordersAwaiting,
  lowStock,
}: {
  ordersAwaiting: number;
  lowStock: number;
}) {
  return (
    <aside className="fixed inset-y-0 right-0 z-20 flex w-64 flex-col border-l border-slate-200 bg-white">
      <Link href="/" className="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
        <span className="text-lg font-bold text-rose-600">کمدرن</span>
        <span className="text-sm text-slate-400">پنل مدیریت</span>
      </Link>
      <nav className="flex-1 overflow-y-auto p-3">
        <NavLink item={{ href: "/", label: "داشبورد" }} />
        <NavLink item={{ href: "/orders", label: "سفارش‌ها", badge: ordersAwaiting }} />
        <NavGroup
          label="کاتالوگ"
          items={[
            { href: "/products", label: "محصولات" },
            { href: "/categories", label: "دسته‌بندی‌ها" },
            { href: "/collections", label: "مجموعه‌ها" },
          ]}
        />
        <NavLink item={{ href: "/inventory", label: "موجودی", badge: lowStock }} />
        <NavLink item={{ href: "/customers", label: "مشتریان" }} />
        <NavGroup
          label="محتوا"
          items={[
            { href: "/pages", label: "صفحات" },
            { href: "/blog", label: "وبلاگ" },
            { href: "/navigation", label: "ناوبری" },
            { href: "/media", label: "رسانه" },
          ]}
        />
        <NavLink item={{ href: "/discounts", label: "تخفیف‌ها" }} />
        <NavLink item={{ href: "/settings", label: "تنظیمات" }} />
        <NavLink item={{ href: "/audit", label: "ممیزی" }} />
      </nav>
      <div className="border-t border-slate-100 p-3 text-xs text-slate-400">کمدرن © ۱۴۰۴</div>
    </aside>
  );
}

export function Topbar({ name, email }: { name: string; email: string }) {
  const pathname = usePathname();
  const titles: Array<[string, string]> = [
    ["/orders", "سفارش‌ها"],
    ["/products", "محصولات"],
    ["/categories", "دسته‌بندی‌ها"],
    ["/collections", "مجموعه‌ها"],
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
  const title = titles.find(([p]) => pathname === p)?.[1] ?? (pathname === "/" ? "داشبورد" : "");
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur">
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-500">{name}</span>
        <span className="text-xs text-slate-400" dir="ltr">{email}</span>
        <form action="/logout" method="post">
          <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            خروج
          </button>
        </form>
      </div>
    </header>
  );
}

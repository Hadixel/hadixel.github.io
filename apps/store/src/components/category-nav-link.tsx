"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@kmodern/ui";

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Desktop category navigation link with active route pill/underline styling.
 */
export function CategoryNavLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex min-h-9 items-center whitespace-nowrap rounded-card px-2.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame-700 xl:text-base",
        active
          ? "bg-flame-50 font-bold text-flame-700 after:absolute after:inset-x-2 after:-bottom-1 after:h-0.5 after:rounded-pill after:bg-flame-600"
          : "text-ink hover:bg-flame-50 hover:text-flame-700",
        className,
      )}
    >
      {children}
    </Link>
  );
}

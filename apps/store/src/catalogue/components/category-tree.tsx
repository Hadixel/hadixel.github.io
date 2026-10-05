"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@kmodern/ui";

/* CategoryTree — the listing rail's tree.

   It replaces a reactbits branched menu whose whole visual identity was a set
   of SVG elbows: the path geometry had to agree, in two places, with the row
   boxes, so a label that wrapped or a column that resized broke the drawing and
   the tick had to be re-measured on every layout change. None of that carries
   meaning here, so the tree is now drawn with a single hairline gutter and a
   disclosure per branch.

   The rule that shapes it: a rail is wayfinding, not a filing cabinet. The
   branch holding the current page starts open (a shopper landing on
   /category/hood-built-in must see where they are without a click), and every
   other branch starts closed so five categories do not read as twenty rows.
   Roots stay plain links — a parent category is a real destination, not just a
   label for its children. */

export type CategoryTreeChild = { value: string; label: string; href: string };
export type CategoryTreeItem = {
  value: string;
  label: string;
  href: string;
  children?: CategoryTreeChild[];
};

export function CategoryTree({
  items,
  activeValue = "",
  className,
}: {
  items: CategoryTreeItem[];
  /** `value` of the row the current route is on. */
  activeValue?: string;
  className?: string;
}) {
  const [opened, setOpened] = useState<Record<string, boolean>>({});

  return (
    <nav aria-label="دسته‌بندی محصولات" className={cn("flex flex-col", className)}>
      {items.map((item) => {
        const kids = item.children ?? [];
        const hasKids = kids.length > 0;
        // Uncontrolled until the shopper touches it: a branch the page is
        // inside is open, everything else is shut.
        const open = opened[item.value] ?? (item.value === activeValue || kids.some((kid) => kid.value === activeValue));
        const panelId = `category-tree-${item.value}`;

        return (
          <div key={item.value} className="border-b border-plaster/70 last:border-b-0">
            <div className="flex items-stretch">
              <Link
                href={item.href}
                aria-current={item.value === activeValue ? "page" : undefined}
                className={cn(
                  "flex-1 truncate py-2.5 text-start text-sm transition-colors",
                  item.value === activeValue ? "font-bold text-flame-700" : "font-semibold text-ink hover:text-flame-700",
                )}
              >
                {item.label}
              </Link>
              {hasKids && (
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  aria-label={`${open ? "بستن" : "باز کردن"} زیردسته‌های ${item.label}`}
                  onClick={() => setOpened((prev) => ({ ...prev, [item.value]: !open }))}
                  className="flex w-8 shrink-0 items-center justify-center text-ash transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame-700"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                    className={cn("transition-transform duration-200 motion-reduce:transform-none", !open && "-rotate-90")}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              )}
            </div>

            {hasKids && (
              /* grid-template-rows 0fr → 1fr animates to the content's own height
                 with no measurement and no fixed row maths; the list carries the
                 min-h-0 that lets it actually collapse. */
              <div
                id={panelId}
                className={cn(
                  "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <ul className="min-h-0 overflow-hidden">
                  <li className="border-s border-fog/70 ps-3">
                    {kids.map((kid) => (
                      <Link
                        key={kid.value}
                        href={kid.href}
                        aria-current={kid.value === activeValue ? "page" : undefined}
                        className={cn(
                          "block truncate py-2 text-sm transition-colors",
                          kid.value === activeValue ? "font-bold text-flame-700" : "text-ash hover:text-ink",
                        )}
                      >
                        {kid.label}
                      </Link>
                    ))}
                  </li>
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

"use client";

/* Panel-only primitives. Everything `@kmodern/ui` already ships is imported
   from there directly — this file is what that package genuinely lacks:
   the form-field wrapper, the server-driven pager, the empty row, the
   loading dot, and the native `<select>` the server-action forms submit.

   The select stays native on purpose. The shared `Select` is a Radix
   popover: it cannot render `<option>` children, it carries no native
   `name`/`defaultValue` form participation, and it is a client boundary —
   the list pages are server components that filter by `<form action>`. */

import { cn } from "@kmodern/ui";
import { toFaDigits } from "@kmodern/contracts";

const controlCls =
  "w-full rounded-card border border-fog bg-white px-3 py-2 text-sm text-ink placeholder:text-ash focus:border-flame-500 focus:outline-none focus:ring-2 focus:ring-flame-100 disabled:cursor-not-allowed disabled:bg-plaster disabled:text-ash motion-reduce:transition-none";

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlCls, "cursor-pointer", className)} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
  required,
  className,
}: {
  label?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  const content = (
    <>
      {label && (
        <legend className="mb-1 flex items-center gap-1 text-sm font-medium text-ink">
          <span>{label}</span>
          {required && <><span aria-hidden="true" className="text-flame-600">*</span><span className="sr-only"> (الزامی)</span></>}
        </legend>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ash">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </>
  );

  // A fieldset/legend gives composite controls a group name. Individual raw
  // controls should still provide an id/aria-label when they are not wrapped
  // in a field.
  return label ? (
    <fieldset className={cn("mb-4 min-w-0 border-0 p-0", className)}>{content}</fieldset>
  ) : (
    <div className={cn("mb-4", className)}>{content}</div>
  );
}

export function Pagination({
  page,
  totalPages,
  basePath,
}: {
  page: number;
  totalPages: number;
  basePath: string;
}) {
  if (!Number.isFinite(totalPages) || totalPages <= 1) return null;
  const safeTotal = Math.max(1, Math.floor(totalPages));
  const safePage = Math.min(Math.max(1, Math.floor(page)), safeTotal);
  const link = (p: number, label?: string) => {
    const sep = basePath.includes("?") ? "&" : "?";
    return (
      <a
        key={p}
        href={`${basePath}${sep}page=${p}`}
        aria-current={p === safePage ? "page" : undefined}
        aria-label={label ? undefined : `صفحه ${p}`}
        className={cn(
          "inline-flex h-8 min-w-8 items-center justify-center rounded-card border px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame-300",
          p === safePage ? "border-flame-700 bg-flame-700 text-white" : "border-fog text-ink hover:bg-plaster",
        )}
      >
        {label ?? toFaDigits(p)}
      </a>
    );
  };
  // The window is a fixed three-wide slice, so an array says the same thing
  // as a Set without the membership bookkeeping.
  const window = [safePage - 1, safePage, safePage + 1].filter((p) => p > 1 && p < safeTotal);
  const items: React.ReactNode[] = [];
  items.push(link(1, "نخست"));
  let previous = 1;
  for (const p of window) {
    if (p - previous > 1) items.push(<span key={`gap-${previous}-${p}`} className="px-1 text-ash" aria-hidden="true">…</span>);
    items.push(link(p));
    previous = p;
  }
  if (safeTotal > 1) {
    if (safeTotal - previous > 1) items.push(<span key={`gap-${previous}-${safeTotal}`} className="px-1 text-ash" aria-hidden="true">…</span>);
    items.push(link(safeTotal, "آخر"));
  }
  return <nav aria-label="صفحه‌بندی" className="mt-4 flex flex-wrap items-center justify-center gap-1.5">{items}</nav>;
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-14 text-center">
      <p className="text-sm text-ash">{text}</p>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="در حال بارگذاری"
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-pill border-2 border-fog border-t-flame-700 motion-reduce:animate-none",
        className,
      )}
    />
  );
}
"use client";

// Small client-side primitives for the admin shell. No new deps: everything
// is Tailwind (v4) + React. Server components can render these; forms are
// client components that wire <form action={serverAction}> or useActionState.

import { cloneElement, isValidElement } from "react";

const cn = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

export function Button({
  variant = "primary",
  size = "md",
  className,
  asChild = false,
  children,
  type,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  asChild?: boolean;
}) {
  const styles = {
    primary:
      "bg-flame-700 text-white hover:bg-flame-800 disabled:bg-flame-300 disabled:cursor-not-allowed",
    secondary:
      "bg-white text-ink border border-fog hover:bg-plaster disabled:opacity-50 disabled:cursor-not-allowed",
    ghost: "bg-transparent text-ink hover:bg-plaster disabled:opacity-50 disabled:cursor-not-allowed",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed",
  } as const;
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-4 py-2 text-sm" } as const;
  const classes = cn(
    "inline-flex items-center justify-center gap-1.5 rounded-card font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-flame-300 motion-reduce:transition-none",
    styles[variant],
    sizes[size],
    className,
  );

  if (asChild && isValidElement(children)) {
    const child = children as React.ReactElement<{ className?: string }>;
    return cloneElement(child, { className: cn(classes, child.props.className) });
  }

  return (
    <button
      type={type ?? "button"}
      className={classes}
      {...props}
    >
      {children}
    </button>
  );
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={cn("mb-1 block text-sm font-medium text-ink", className)}>{children}</label>;
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

const inputCls =
  "w-full rounded-card border border-fog bg-white px-3 py-2 text-sm text-ink placeholder:text-ash focus:border-flame-500 focus:outline-none focus:ring-2 focus:ring-flame-100 disabled:cursor-not-allowed disabled:bg-plaster disabled:text-ash motion-reduce:transition-none";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputCls, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputCls, "min-h-[80px]", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputCls, "cursor-pointer", className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
      <input type="checkbox" className="h-4 w-4 rounded border-fog text-flame-700 focus:ring-flame-500" {...props} />
      {label}
    </label>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-card border border-plaster bg-canvas", className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ash">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

/* Badge — Showcase pill anatomy (30px, fill-only differentiation). The
   chroma spectrum is retired: flame/pale/spate/emerald-muted only. */
const badgeColors: Record<string, string> = {
  gray: "bg-plaster text-ink",
  slate: "bg-plaster text-ink",
  green: "bg-emerald-100 text-emerald-900",
  emerald: "bg-emerald-100 text-emerald-900",
  amber: "bg-flame-100 text-flame-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-flame-100 text-flame-800",
  sky: "bg-flame-100 text-flame-800",
  violet: "bg-plaster text-ink",
  rose: "bg-flame-100 text-flame-800",
  teal: "bg-emerald-100 text-emerald-900",
};

export function Badge({
  color = "gray",
  className,
  children,
}: {
  color?: keyof typeof badgeColors;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-[30px] px-2 py-0.5 text-xs font-medium", badgeColors[color], className)}>
      {children}
    </span>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flame-300" tabIndex={0} role="region" aria-label="جدول داده‌ها">
      <table className="w-full text-right text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b border-plaster text-xs text-ash">{children}</thead>;
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-plaster">{children}</tbody>;
}

export function TR({
  children,
  className,
  onClick,
  onKeyDown,
  tabIndex,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { onClick?: () => void }) {
  const interactive = Boolean(onClick);
  return (
    <tr
      {...props}
      onClick={onClick}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          !interactive ||
          event.defaultPrevented ||
          (event.target instanceof HTMLElement && event.target.closest("a,button,input,select,textarea"))
        ) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      }}
      tabIndex={interactive ? tabIndex ?? 0 : tabIndex}
      className={cn("hover:bg-plaster", className, interactive && "cursor-pointer focus-visible:bg-plaster focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flame-300")}
    >
      {children}
    </tr>
  );
}

export function TH({ children, className, dir }: { children?: React.ReactNode; className?: string; dir?: string }) {
  return <th dir={dir} className={cn("px-4 py-2.5 font-medium whitespace-nowrap", className)}>{children}</th>;
}

export function TD({ children, className, dir }: { children?: React.ReactNode; className?: string; dir?: string }) {
  return <td dir={dir} className={cn("px-4 py-3", className)}>{children}</td>;
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
        {label ?? faDigits(p)}
      </a>
    );
  };

  const window = new Set<number>();
  for (let p = safePage - 1; p <= safePage + 1; p++) {
    if (p > 1 && p < safeTotal) window.add(p);
  }
  const items: React.ReactNode[] = [];
  items.push(link(1, "نخست"));
  let previous = 1;
  for (const p of [...window].sort((a, b) => a - b)) {
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
        "inline-block h-4 w-4 animate-spin rounded-[30px] border-2 border-fog border-t-flame-700 motion-reduce:animate-none",
        className,
      )}
    />
  );
}

export function faDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}
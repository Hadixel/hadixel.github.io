"use client";

// Small client-side primitives for the admin shell. No new deps: everything
// is Tailwind (v4) + React. Server components can render these; forms are
// client components that wire <form action={serverAction}> or useActionState.

import { useActionState } from "react";

const cn = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  const styles = {
    primary:
      "bg-flame-700 text-white hover:bg-flame-800 disabled:bg-flame-300 disabled:cursor-not-allowed",
    secondary:
      "bg-white text-ink border border-fog hover:bg-plaster disabled:opacity-50",
    ghost: "bg-transparent text-ink hover:bg-plaster",
    danger: "bg-red-600 text-white hover:bg-red-700",
  } as const;
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-4 py-2 text-sm" } as const;
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-card font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-flame-300",
        styles[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
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
  return (
    <div className={cn("mb-4", className)}>
      {label && (
        <div className="mb-1 flex items-center gap-1 text-sm font-medium text-ink">
          <span>{label}</span>
          {required && <span className="text-flame-600">*</span>}
        </div>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ash">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-card border border-fog bg-white px-3 py-2 text-sm text-ink placeholder:text-ash focus:border-flame-500 focus:outline-none focus:ring-2 focus:ring-flame-100";

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
    <div className="flex items-start justify-between gap-4 border-b border-plaster px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ash">{subtitle}</p>}
      </div>
      {actions}
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
    <div className="overflow-x-auto">
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

export function TR({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return <tr onClick={onClick} className={cn("hover:bg-plaster", className, onClick && "cursor-pointer")}>{children}</tr>;
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
  if (totalPages <= 1) return null;
  const link = (p: number, label?: string) => {
    const sep = basePath.includes("?") ? "&" : "?";
    return (
      <a
        key={p}
        href={`${basePath}${sep}page=${p}`}
        className={cn(
          "inline-flex h-8 min-w-8 items-center justify-center rounded-card border px-2 text-sm",
          p === page ? "border-flame-700 bg-flame-700 text-white" : "border-fog text-ink hover:bg-plaster",
        )}
      >
        {label ?? faDigits(p)}
      </a>
    );
  };
  const items = [];
  for (let p = 1; p <= totalPages; p++) items.push(link(p));
  return <div className="mt-4 flex items-center justify-center gap-1.5">{items}</div>;
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
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-[30px] border-2 border-fog border-t-flame-700",
        className,
      )}
    />
  );
}

export { useActionState };

export function faDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}
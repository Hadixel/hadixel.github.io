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
      "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed",
    secondary:
      "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:opacity-50",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
    danger: "bg-red-600 text-white hover:bg-red-700",
  } as const;
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-4 py-2 text-sm" } as const;
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-rose-300",
        styles[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={cn("mb-1 block text-sm font-medium text-slate-700", className)}>{children}</label>;
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
        <div className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-700">
          <span>{label}</span>
          {required && <span className="text-rose-500">*</span>}
        </div>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100";

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
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-400" {...props} />
      {label}
    </label>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

const badgeColors: Record<string, string> = {
  gray: "bg-slate-100 text-slate-700",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  blue: "bg-sky-100 text-sky-800",
  violet: "bg-violet-100 text-violet-800",
  rose: "bg-rose-100 text-rose-700",
  teal: "bg-teal-100 text-teal-800",
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
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", badgeColors[color], className)}>
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
  return <thead className="border-b border-slate-200 text-xs text-slate-500">{children}</thead>;
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

export function TR({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return <tr onClick={onClick} className={cn("hover:bg-slate-50", className, onClick && "cursor-pointer")}>{children}</tr>;
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
          "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm",
          p === page ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50",
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
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-rose-600",
        className,
      )}
    />
  );
}

export { useActionState };

export function faDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}
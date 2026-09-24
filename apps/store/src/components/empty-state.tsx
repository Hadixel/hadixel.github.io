import Link from "next/link";
import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
  icon,
  compact = false,
}: {
  title: string;
  description: string;
  action?: { label: string; href: string };
  icon?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`mx-auto flex max-w-xl flex-col items-center text-center ${compact ? "py-10" : "py-20"}`}>
      <div className="mb-5 flex size-14 items-center justify-center rounded-card bg-plaster text-ash" aria-hidden>
        {icon ?? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7.5h16v11H4z" />
            <path d="M8 7.5V5h8v2.5M8 12h8" />
          </svg>
        )}
      </div>
      <h2 className="font-display text-2xl font-extrabold text-ink">{title}</h2>
      <p className="mt-3 max-w-md text-sm leading-7 text-ash">{description}</p>
      {action && (
        <Link href={action.href} className="mt-7 inline-flex min-h-11 items-center justify-center rounded-card bg-flame-700 px-6 text-sm font-bold text-white transition-colors hover:bg-flame-600">
          {action.label}
        </Link>
      )}
    </div>
  );
}

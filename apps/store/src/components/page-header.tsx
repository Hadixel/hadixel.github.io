import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-5 border-b border-plaster pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-balance font-display text-3xl font-black leading-tight text-ink sm:text-4xl">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-sm leading-7 text-ash">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

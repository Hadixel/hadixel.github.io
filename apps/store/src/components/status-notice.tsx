import type { ReactNode } from "react";

const tones = {
  neutral: "border-plaster bg-canvas text-ink",
  info: "border-flame-200 bg-flame-50 text-flame-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  danger: "border-red-200 bg-red-50 text-red-900",
} as const;

export function StatusNotice({
  title,
  children,
  tone = "neutral",
  icon,
  role,
}: {
  title?: string;
  children: ReactNode;
  tone?: keyof typeof tones;
  icon?: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div className={`rounded-card border px-4 py-3.5 text-sm leading-6 ${tones[tone]}`} role={role}>
      <div className="flex items-start gap-3">
        {icon && <span className="mt-0.5 shrink-0" aria-hidden>{icon}</span>}
        <div className="min-w-0">
          {title && <div className="font-bold">{title}</div>}
          <div className={title ? "mt-0.5" : undefined}>{children}</div>
        </div>
      </div>
    </div>
  );
}

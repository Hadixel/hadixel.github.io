import * as React from "react";

import { cn } from "../cn";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-card border border-fog bg-canvas px-3 text-sm text-ink transition-colors",
        "placeholder:text-slate-line focus:border-flame-700 focus:outline-none focus:ring-2 focus:ring-flame-100",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-20 w-full rounded-card border border-fog bg-canvas px-3 py-2 text-sm text-ink transition-colors",
        "placeholder:text-slate-line focus:border-flame-700 focus:outline-none focus:ring-2 focus:ring-flame-100",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("text-sm font-medium text-ink select-none", className)}
      {...props}
    />
  );
}

export { Input, Textarea, Label };

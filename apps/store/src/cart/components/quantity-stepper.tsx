"use client";

import { useState } from "react";
import { cn } from "@kmodern/ui";
import { toFaDigits } from "@kmodern/contracts/format";
import { digitsOnly } from "@kmodern/contracts";


/** Field accepts Persian, Arabic or Latin digits; returns null while the field is empty or mid-edit. */
function parseQuantity(raw: string): number | null {
  const digits = digitsOnly(raw);
  return digits ? Number(digits) : null;
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  label = "تعداد",
  compact = false,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
  compact?: boolean;
}) {
  const safeMin = typeof min === "number" && Number.isFinite(min) && min >= 1 ? Math.floor(min) : 1;
  const safeMax = typeof max === "number" && Number.isFinite(max) && max >= safeMin ? Math.floor(max) : 99;
  const safeValue = typeof value === "number" && Number.isFinite(value) && value >= safeMin ? Math.floor(value) : safeMin;

  // Draft keeps the raw keystrokes so typing does not fight the formatted value; blur restores it.
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (next: number) => {
    const n = typeof next === "number" && Number.isFinite(next) ? Math.floor(next) : safeMin;
    return Math.max(safeMin, Math.min(safeMax, n));
  };

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-stretch overflow-hidden rounded-card border border-fog bg-canvas",
        compact ? "h-11" : "h-12",
        "focus-within:border-flame-700 focus-within:ring-2 focus-within:ring-flame-700/25",
      )}
    >
      <button
        type="button"
        aria-label="افزایش تعداد"
        disabled={safeValue >= safeMax}
        onClick={(e) => {
          e.preventDefault();
          onChange(clamp(safeValue + 1));
        }}
        className={cn(
          "flex shrink-0 items-center justify-center text-ink transition-colors focus-visible:outline-none",
          compact ? "w-11" : "w-12",
          "hover:bg-plaster active:bg-fog",
          "disabled:pointer-events-none disabled:text-slate-line",
        )}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <span
        className={cn(
          "flex shrink-0 items-center justify-center border-x border-fog bg-plaster/70",
          compact ? "w-11" : "w-12",
        )}
      >
        <input
          aria-label={label}
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={draft ?? toFaDigits(safeValue)}
          onChange={(event) => {
            const digits = digitsOnly(event.target.value);
            setDraft(digits);
            const parsed = parseQuantity(digits);
            if (parsed !== null) onChange(clamp(parsed));
          }}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              onChange(clamp(safeValue + 1));
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              onChange(clamp(safeValue - 1));
            }
          }}
          className="w-full min-w-0 bg-transparent text-center font-display text-base font-black tabular-nums text-ink outline-none"
        />
      </span>

      <button
        type="button"
        aria-label="کاهش تعداد"
        disabled={safeValue <= safeMin}
        onClick={(e) => {
          e.preventDefault();
          onChange(clamp(safeValue - 1));
        }}
        className={cn(
          "flex shrink-0 items-center justify-center text-ink transition-colors focus-visible:outline-none",
          compact ? "w-11" : "w-12",
          "hover:bg-plaster active:bg-fog",
          "disabled:pointer-events-none disabled:text-slate-line",
        )}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M5 12h14" />
        </svg>
      </button>

      <span className="sr-only" aria-live="polite">{toFaDigits(safeValue)}</span>
    </div>
  );
}

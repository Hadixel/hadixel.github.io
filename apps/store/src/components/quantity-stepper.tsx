"use client";

import { Button } from "@heroui/react";
import { toFaDigits } from "@kmodern/schema";

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
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  return (
    <div className={`inline-flex items-center rounded-card border border-fog bg-canvas ${compact ? "h-10" : "h-11"}`} aria-label={label}>
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        aria-label="کاهش تعداد"
        isDisabled={value <= min}
        onPress={() => onChange(clamp(value - 1))}
        className="size-9 rounded-card"
      >
        −
      </Button>
      <span className="min-w-9 text-center text-sm font-bold tabular-nums text-ink" aria-live="polite">{toFaDigits(value)}</span>
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        aria-label="افزایش تعداد"
        isDisabled={value >= max}
        onPress={() => onChange(clamp(value + 1))}
        className="size-9 rounded-card"
      >
        +
      </Button>
    </div>
  );
}

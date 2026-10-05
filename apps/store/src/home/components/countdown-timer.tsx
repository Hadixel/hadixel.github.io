"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toFaDigits } from "@kmodern/contracts/format";
import { cn } from "@kmodern/ui";

function remaining(to: number) {
  const diff = Math.max(0, to - Date.now());
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    ended: diff === 0,
  };
}

/* One timer, two surfaces: the white canvas of a content block and the ink
   band of the deal grid. The numerals carry the flame accent — a countdown
   is the activation moment of whichever surface it lands on. */
const tones = {
  canvas: {
    strip: "divide-fog border-fog bg-plaster",
    numeral: "text-flame-700",
    unit: "text-ash",
  },
  "on-ink": {
    strip: "divide-white/10 border-white/10 bg-white/10",
    numeral: "text-flame-400",
    unit: "text-white/50",
  },
} as const;

export type CountdownTone = keyof typeof tones;

export function CountdownTimer({ endsAt, linkHref, tone = "canvas" }: {
  endsAt: string;
  linkHref?: string | null;
  tone?: CountdownTone;
}) {
  const target = new Date(endsAt).getTime();
  const [left, setLeft] = useState(() => remaining(target));

  useEffect(() => {
    const timer = setInterval(() => setLeft(remaining(target)), 30_000);
    return () => clearInterval(timer);
  }, [target]);

  // No `aria-live` on the grid: a polite region re-announces the whole
  // countdown every interval, which is noise. The timer is a static readout;
  // the caption above it carries the urgency.
  if (left.ended || Number.isNaN(target)) {
    return <div className="text-center text-sm font-semibold text-ash">این پیشنهاد به پایان رسید</div>;
  }

  const cells = [
    { value: left.days, label: "روز" },
    { value: left.hours, label: "ساعت" },
    { value: left.minutes, label: "دقیقه" },
  ];

  const inner = (
    <div role="timer" className={cn("grid grid-cols-3 divide-x overflow-hidden rounded-card border", tones[tone].strip)}>
      {cells.map((cell) => (
        <div key={cell.label} className="flex min-w-[3.4rem] flex-col items-center px-2.5 py-2 text-center sm:min-w-[4rem] sm:py-2.5">
          <span className={cn("font-black leading-none tabular-nums", tones[tone].numeral, cell.value >= 100 ? "text-sm sm:text-lg" : "text-base sm:text-2xl")}>
            {toFaDigits(cell.value)}
          </span>
          <span className={cn("mt-1 text-micro font-medium leading-tight", tones[tone].unit)}>{cell.label}</span>
        </div>
      ))}
    </div>
  );

  return linkHref ? <Link href={linkHref} className="mx-auto block w-fit">{inner}</Link> : <div className="w-fit">{inner}</div>;
}

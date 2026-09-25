"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toFaDigits } from "@kmodern/schema/format";

function remaining(to: number) {
  const diff = Math.max(0, to - Date.now());
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    ended: diff === 0,
  };
}

export function CountdownTimer({ endsAt, linkHref }: { endsAt: string; linkHref?: string | null }) {
  const target = new Date(endsAt).getTime();
  const [left, setLeft] = useState(() => remaining(target));

  useEffect(() => {
    const timer = setInterval(() => setLeft(remaining(target)), 30_000);
    return () => clearInterval(timer);
  }, [target]);

  if (left.ended || Number.isNaN(target)) {
    return <div className="text-center text-sm font-semibold text-ash">این پیشنهاد به پایان رسید</div>;
  }

  const cells = [
    { value: left.days, label: "روز" },
    { value: left.hours, label: "ساعت" },
    { value: left.minutes, label: "دقیقه" },
  ];

  const inner = (
    <div className="grid grid-cols-3 gap-2 sm:gap-4" aria-live="polite">
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0 rounded-card bg-ink px-3 py-3 text-center text-white sm:min-w-20 sm:px-4">
          <div className="text-xl font-black tabular-nums sm:text-2xl">{toFaDigits(cell.value)}</div>
          <div className="mt-1 text-[11px] text-white/55 sm:text-xs">{cell.label}</div>
        </div>
      ))}
    </div>
  );

  return linkHref ? <Link href={linkHref} className="mx-auto block w-fit">{inner}</Link> : <div className="mx-auto w-fit">{inner}</div>;
}

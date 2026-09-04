"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toFaDigits } from "@kmodern/schema";

function remaining(to: number) {
  const diff = Math.max(0, to - Date.now());
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    ended: diff === 0,
  };
}

// Countdown to props.endsAt (ISO); renders an ended state after the deadline.
export function CountdownTimer({
  endsAt,
  linkHref,
}: {
  endsAt: string;
  linkHref?: string | null;
}) {
  const target = new Date(endsAt).getTime();
  const [left, setLeft] = useState(() => remaining(target));

  useEffect(() => {
    const t = setInterval(() => setLeft(remaining(target)), 30_000);
    return () => clearInterval(t);
  }, [target]);

  if (left.ended) {
    return <div className="text-center text-lg font-semibold text-ash">این پیشنهاد به پایان رسید</div>;
  }

  const cells = [
    { value: left.days, label: "روز" },
    { value: left.hours, label: "ساعت" },
    { value: left.minutes, label: "دقیقه" },
  ];

  const inner = (
    <div className="flex items-center justify-center gap-4">
      {cells.map((c) => (
        <div key={c.label} className="min-w-20 rounded-2xl bg-ink px-4 py-3 text-center text-white">
          <div className="text-2xl font-extrabold tabular-nums">{toFaDigits(String(c.value))}</div>
          <div className="mt-1 text-xs text-slate-line">{c.label}</div>
        </div>
      ))}
    </div>
  );

  return linkHref ? <Link href={linkHref}>{inner}</Link> : inner;
}

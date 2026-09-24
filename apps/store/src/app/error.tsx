"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[55vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-card bg-plaster text-ash" aria-hidden>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v10M12 17h.01" /><path d="M10.3 4.7 3.2 17a2 2 0 0 0 1.7 3h14.2a2 2 0 0 0 1.7-3L13.7 4.7a2 2 0 0 0-3.4 0Z" /></svg>
      </div>
      <h1 className="mt-6 font-display text-2xl font-black text-ink">بارگذاری این بخش انجام نشد</h1>
      <p className="mt-3 max-w-md text-sm leading-7 text-ash">می‌توانید دوباره تلاش کنید؛ اگر مشکل ادامه داشت، بعداً به فروشگاه برگردید.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => retry()} className="min-h-11 rounded-card bg-flame-700 px-6 text-sm font-bold text-white transition-colors hover:bg-flame-600">تلاش دوباره</button>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-card border border-fog px-6 text-sm font-bold text-ink transition-colors hover:bg-plaster">بازگشت به خانه</Link>
      </div>
    </div>
  );
}

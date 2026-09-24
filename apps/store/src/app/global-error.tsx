"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-screen bg-canvas text-ink">
        <main className="flex min-h-screen items-center justify-center px-4 text-center">
          <div>
            <div className="font-display text-5xl font-black text-ink">خطایی رخ داد</div>
            <p className="mt-4 text-sm leading-7 text-ash">فروشگاه در این لحظه قابل نمایش نیست. دوباره تلاش کنید.</p>
            <button type="button" onClick={() => retry()} className="mt-7 min-h-11 rounded-card bg-flame-700 px-6 text-sm font-bold text-white">تلاش دوباره</button>
          </div>
        </main>
      </body>
    </html>
  );
}

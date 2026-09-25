"use client";

export default function PanelError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center" role="alert">
      <h1 className="text-lg font-bold text-ink">بارگذاری این بخش انجام نشد</h1>
      <p className="max-w-md text-sm leading-7 text-ash">لطفاً دوباره تلاش کنید. اگر مشکل ادامه داشت، وضعیت سرور را بررسی کنید.</p>
      <button type="button" onClick={() => reset()} className="rounded-card bg-flame-700 px-4 py-2 text-sm font-semibold text-white hover:bg-flame-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame-300">
        تلاش دوباره
      </button>
    </div>
  );
}

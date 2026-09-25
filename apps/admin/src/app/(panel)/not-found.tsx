import Link from "next/link";

export default function PanelNotFound() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-lg font-bold text-ink">صفحه پیدا نشد</h1>
      <p className="text-sm text-ash">ممکن است رکورد حذف شده یا نشانی وارد‌شده اشتباه باشد.</p>
      <Link href="/" className="rounded-card bg-flame-700 px-4 py-2 text-sm font-semibold text-white hover:bg-flame-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flame-300">بازگشت به داشبورد</Link>
    </div>
  );
}

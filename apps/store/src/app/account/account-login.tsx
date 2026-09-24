"use client";

import { useRouter } from "next/navigation";
import AuthModal from "@/components/auth-modal";

export default function AccountLogin() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
      <div className="grid overflow-hidden rounded-card bg-plaster md:grid-cols-[1.05fr_.95fr]">
        <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14">
          <h1 className="text-balance font-display text-3xl font-black leading-tight text-ink sm:text-4xl">سفارش‌ها و حساب شما، در یک نگاه</h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-ash">برای پیگیری وضعیت سفارش‌ها، تاریخچه خرید و اطلاعات حساب، وارد شوید. اولین ورود با شماره موبایل انجام می‌شود.</p>
          <AuthModal
            onClose={() => router.refresh()}
            trigger="ورود / ثبت‌نام"
            triggerClassName="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-card bg-flame-700 px-6 font-bold text-white transition-colors hover:bg-flame-600 sm:w-auto"
          />
        </div>
        <div className="grid gap-px bg-fog/70 sm:grid-cols-3 md:grid-cols-1">
          {[
            ["پیگیری ساده", "وضعیت پرداخت و ارسال هر سفارش"],
            ["آدرس‌های شما", "اطلاعات تماس و تحویل در دسترس"],
            ["تاریخچه خرید", "محصولات و سفارش‌های قبلی"],
          ].map(([title, text]) => (
            <div key={title} className="bg-canvas p-5 lg:p-7">
              <div className="size-1.5 rounded-[30px] bg-flame-700" aria-hidden />
              <div className="mt-4 text-sm font-bold text-ink">{title}</div>
              <div className="mt-1.5 text-xs leading-6 text-ash">{text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

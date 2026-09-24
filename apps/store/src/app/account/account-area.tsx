"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toFaDigits } from "@kmodern/schema";
import { OrderRow, type OrderRowData } from "@/components/order-row";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export function AccountArea({
  phone,
  orderCount,
  recentOrders,
}: {
  phone: string;
  orderCount: number;
  recentOrders: OrderRowData[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"orders" | "info">("orders");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function logout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("logout");
      router.refresh();
    } catch {
      setLogoutError("خروج از حساب انجام نشد. دوباره تلاش کنید.");
      setLoggingOut(false);
    }
  }

  const tabs = [
    { id: "orders" as const, label: "سفارش‌ها" },
    { id: "info" as const, label: "اطلاعات حساب" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
      <PageHeader
        title="حساب من"
        description="سفارش‌های اخیر و اطلاعات حساب خود را از این بخش مدیریت کنید."
        actions={<span className="rounded-[30px] bg-flame-50 px-3 py-1.5 text-xs font-bold text-flame-800">{toFaDigits(orderCount)} سفارش</span>}
      />

      <div role="tablist" aria-label="بخش‌های حساب" className="flex gap-6 overflow-x-auto border-b border-plaster">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`account-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`account-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            className={`-mb-px shrink-0 border-b-2 pb-3 text-sm font-bold transition-colors ${tab === item.id ? "border-flame-700 text-flame-800" : "border-transparent text-ash hover:text-ink"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <div role="tabpanel" id="account-panel-orders" aria-labelledby="account-tab-orders" className="mt-6 space-y-4">
          {recentOrders.length === 0 ? (
            <EmptyState
              title="هنوز سفارشی ثبت نکرده‌اید"
              description="اولین خرید شما می‌تواند از میان فر، اجاق گاز، هود و سینک آغاز شود."
              action={{ label: "شروع خرید", href: "/products" }}
              compact
            />
          ) : (
            <>
              {recentOrders.map((order) => <OrderRow key={order.orderNumber} order={order} />)}
              {orderCount > recentOrders.length && (
                <a href="/orders" className="block rounded-card bg-plaster/70 py-4 text-center text-sm font-bold text-ink transition-colors hover:bg-plaster">
                  مشاهده همه {toFaDigits(orderCount - recentOrders.length)} سفارش قبلی
                </a>
              )}
            </>
          )}
        </div>
      )}

      {tab === "info" && (
        <div role="tabpanel" id="account-panel-info" aria-labelledby="account-tab-info" className="mt-6">
          <div className="rounded-card bg-plaster/70 p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs text-ash">شماره موبایل</div>
                <div className="mt-1 font-semibold text-ink" dir="ltr">{toFaDigits(phone)}</div>
              </div>
              <span className="rounded-[30px] bg-flame-50 px-3 py-1.5 text-xs font-bold text-flame-800">تأیید شده</span>
            </div>
            <div className="mt-6 grid gap-px overflow-hidden rounded-card bg-fog/70 sm:grid-cols-2">
              <div className="bg-canvas p-4">
                <div className="font-display text-2xl font-black tabular-nums text-ink">{toFaDigits(orderCount)}</div>
                <div className="mt-1 text-xs text-ash">سفارش ثبت‌شده</div>
              </div>
              <div className="bg-canvas p-4">
                <div className="font-display text-2xl font-black text-ink">فعال</div>
                <div className="mt-1 text-xs text-ash">وضعیت حساب</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              disabled={loggingOut}
              className="mt-6 min-h-11 rounded-card border border-fog bg-canvas px-5 text-sm font-bold text-ink transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            >
              {loggingOut ? "در حال خروج…" : "خروج از حساب"}
            </button>
            {logoutError && <p className="mt-3 text-sm text-red-700" role="alert">{logoutError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

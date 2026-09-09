"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toFaDigits } from "@kmodern/schema";
import { OrderRow, type OrderRowData } from "@/components/order-row";

/*
 * AccountArea — tabbed account surface: سفارش‌ها (recent orders inline,
 * full history at /orders) + اطلاعات حساب (phone, stats, logout).
 * Server page passes serialized data; tabs are pure client state.
 */
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

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  const tabs = [
    { id: "orders" as const, label: "سفارش‌ها" },
    { id: "info" as const, label: "اطلاعات حساب" },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold text-ink">حساب من</h1>

      {/* tab bar — underline idiom, flame for the active tab */}
      <div role="tablist" aria-label="بخش‌های حساب" className="mt-6 flex gap-6 border-b border-plaster">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 pb-3 text-sm font-semibold transition-colors ${
              tab === t.id ? "border-flame-700 text-flame-800" : "border-transparent text-ash hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <div role="tabpanel" className="mt-6 space-y-4">
          {recentOrders.length === 0 ? (
            <div className="rounded-card border border-plaster bg-white px-6 py-12 text-center">
              <p className="text-sm text-ash">هنوز سفارشی ثبت نکرده‌اید.</p>
            </div>
          ) : (
            <>
              {recentOrders.map((o) => (
                <OrderRow key={o.orderNumber} order={o} />
              ))}
              {orderCount > recentOrders.length && (
                <p className="pt-2 text-center text-sm text-ash">
                  {toFaDigits(orderCount - recentOrders.length)} سفارش قدیمی‌تر در{" "}
                  <a href="/orders" className="font-semibold text-flame-800 hover:underline">سابقه سفارش‌ها</a>.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {tab === "info" && (
        <div role="tabpanel" className="mt-6">
          <div className="rounded-card border border-plaster bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-ash">شماره موبایل</div>
                <div className="mt-1 font-semibold text-ink" dir="ltr">{toFaDigits(phone)}</div>
              </div>
              <span className="rounded-[30px] bg-flame-50 px-2.5 py-0.5 text-xs text-flame-800">تایید شده</span>
            </div>
            <div className="mt-5 border-t border-plaster pt-5 text-sm text-ash">
              {toFaDigits(orderCount)} سفارش ثبت شده در حساب
            </div>
            <button
              onClick={logout}
              disabled={loggingOut}
              className="mt-6 rounded-card border border-fog px-5 py-2 text-sm font-semibold text-ink transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              {loggingOut ? "در حال خروج…" : "خروج از حساب"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

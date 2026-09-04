import { currentCustomer } from "@/lib/auth";
import Link from "next/link";
import { db } from "@kmodern/db";
import { toFaDigits } from "@kmodern/schema";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await currentCustomer();
  if (!me) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">حساب من</h1>
        <p className="mt-4 text-ash">برای مشاهده حساب، شماره موبایل خود را هنگام ثبت سفارش تأیید کنید.</p>
        <Link href="/products" className="mt-6 inline-block rounded-card bg-flame-700 px-8 py-3 font-semibold text-white hover:bg-flame-600">مشاهده محصولات</Link>
      </div>
    );
  }
  const orderCount = await db().order.count({ where: { customerId: me.customer.id } });
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">حساب من</h1>
      <div className="mt-6 rounded-xl border p-5">
        <div className="font-semibold">{toFaDigits(me.customer.phone)}</div>
        <div className="mt-1 text-sm text-ash">{toFaDigits(orderCount)} سفارش ثبت شده</div>
        <div className="mt-4 flex gap-3">
          <Link href="/orders" className="rounded-card bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">سفارشهای من</Link>
        </div>
      </div>
    </div>
  );
}
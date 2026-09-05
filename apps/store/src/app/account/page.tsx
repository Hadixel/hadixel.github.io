import { currentCustomer } from "@/lib/auth";
import Link from "next/link";
import { db } from "@kmodern/db";
import { toFaDigits } from "@kmodern/schema";
import AccountLogin from "./account-login";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await currentCustomer();
  if (!me) {
    return <AccountLogin />;
  }
  const orderCount = await db().order.count({ where: { customerId: me.customer.id } });
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">حساب من</h1>
      <div className="mt-6 rounded-card border border-plaster p-5">
        <div className="font-semibold">{toFaDigits(me.customer.phone)}</div>
        <div className="mt-1 text-sm text-ash">{toFaDigits(orderCount)} سفارش ثبت شده</div>
        <div className="mt-4 flex gap-3">
          <Link href="/orders" className="rounded-card bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-charcoal">سفارشهای من</Link>
        </div>
      </div>
    </div>
  );
}

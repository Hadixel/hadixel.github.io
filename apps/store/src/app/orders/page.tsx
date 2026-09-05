import { db } from "@kmodern/db";
import { currentCustomer } from "@/lib/auth";
import Link from "next/link";
import { formatToman, toFaDigits } from "@kmodern/schema";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const me = await currentCustomer();
  if (!me) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">سفارشهای من</h1>
        <p className="mt-4 text-ash">برای مشاهده سفارشها وارد شوید.</p>
        <Link href="/" className="mt-6 inline-block rounded-card bg-flame-700 px-8 py-3 font-semibold text-white hover:bg-flame-600">بازگشت به فروشگاه</Link>
      </div>
    );
  }
  const orders = await db().order.findMany({
    where: { customerId: me.customer.id },
    orderBy: { placedAt: "desc" },
    include: { items: true },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-bold">سفارشهای من</h1>
      {orders.length === 0 && <p className="text-ash">هنوز سفارشی ثبت نکردهاید.</p>}
      <div className="space-y-4">
        {orders.map((o) => (
          <Link key={o.id} href={`/order/${o.orderNumber}`} className="block rounded-card border border-plaster p-5 transition-colors hover:border-fog">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold">{toFaDigits(o.orderNumber)}</div>
                <div className="mt-1 text-sm text-ash">{new Date(o.placedAt).toLocaleDateString("fa-IR")} · {toFaDigits(o.items.reduce((s, i) => s + i.quantity, 0))} قلم</div>
              </div>
              <div className="text-left">
                <div className="font-bold">{formatToman(o.total)}</div>
                <div className="mt-1 text-xs text-ash">{o.fulfillmentStatus === "DELIVERED" ? "تحویل شده" : o.paymentStatus === "AWAITING" ? "در انتظار پرداخت" : "در حال انجام"}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
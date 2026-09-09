import { db } from "@kmodern/db";
import { currentCustomer } from "@/lib/auth";
import Link from "next/link";
import { orderStatusKey, type OrderRowData } from "@/components/order-row";
import { OrderRow } from "@/components/order-row";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const me = await currentCustomer();
  if (!me) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="font-display text-3xl font-extrabold">سفارش‌های من</h1>
        <p className="mt-4 text-ash">برای مشاهده سفارش‌ها وارد حساب شوید.</p>
        <Link href="/account" className="mt-8 inline-block rounded-card bg-flame-700 px-8 py-3 font-semibold text-white transition hover:bg-flame-600">ورود / ثبت‌نام</Link>
      </div>
    );
  }
  const orders = await db().order.findMany({
    where: { customerId: me.customer.id },
    orderBy: { placedAt: "desc" },
    include: { items: true },
    take: 50,
  });
  const rows: OrderRowData[] = orders.map((o) => ({
    orderNumber: o.orderNumber,
    placedAt: o.placedAt.toISOString(),
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
    total: o.total,
    statusKey: orderStatusKey({ fulfillmentStatus: o.fulfillmentStatus, paymentStatus: o.paymentStatus }),
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold text-ink">سفارش‌های من</h1>
      {rows.length === 0 ? (
        <div className="mt-6 rounded-card border border-plaster bg-white px-6 py-12 text-center text-sm text-ash">
          هنوز سفارشی ثبت نکرده‌اید.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {rows.map((o) => (
            <OrderRow key={o.orderNumber} order={o} />
          ))}
        </div>
      )}
    </div>
  );
}

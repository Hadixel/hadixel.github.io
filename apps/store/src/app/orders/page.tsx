import { db } from "@kmodern/db";
import { currentCustomer } from "@/lib/auth";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { OrderRow, orderStatusKey, type OrderRowData } from "@/components/order-row";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const me = await currentCustomer();
  if (!me) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <EmptyState
          title="برای دیدن سفارش‌ها وارد شوید"
          description="پس از ورود، تاریخچه و وضعیت همه سفارش‌های این شماره موبایل نمایش داده می‌شود."
          action={{ label: "ورود / ثبت‌نام", href: "/account" }}
        />
      </div>
    );
  }

  const orders = await db().order.findMany({
    where: { customerId: me.customer.id },
    orderBy: { placedAt: "desc" },
    include: { items: true },
    take: 50,
  });
  const rows: OrderRowData[] = orders.map((order) => ({
    orderNumber: order.orderNumber,
    placedAt: order.placedAt.toISOString(),
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    total: order.total,
    statusKey: orderStatusKey({ fulfillmentStatus: order.fulfillmentStatus, paymentStatus: order.paymentStatus }),
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
      <PageHeader title="سفارش‌های من" description="تاریخچه سفارش‌ها و آخرین وضعیت پرداخت و ارسال را بررسی کنید." />
      {rows.length === 0 ? (
        <EmptyState title="هنوز سفارشی ثبت نکرده‌اید" description="سفارش‌های ثبت‌شده در این بخش نگه‌داری می‌شوند." action={{ label: "شروع خرید", href: "/products" }} compact />
      ) : (
        <div className="space-y-4">{rows.map((order) => <OrderRow key={order.orderNumber} order={order} />)}</div>
      )}
    </div>
  );
}

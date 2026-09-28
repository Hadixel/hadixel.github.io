import { currentCustomer } from "@/lib/customer-session";
import { orderRows, readMyOrders } from "@/lib/my-orders";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { OrderRow } from "@/components/order-row";

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

  // The gateway scopes this to the caller's session and answers with the row this page prints. It
  // used to query the order table here and assemble that row itself, which is where the item count,
  // the status badge key and the formatted total each came from.
  const { orders } = await readMyOrders();
  const rows = orderRows(orders);

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

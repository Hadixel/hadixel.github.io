import { currentCustomer } from "@/account/lib/customer-session";
import { orderRows, readMyOrders } from "@/orders/lib/my-orders";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { OrderRow, type OrderRowData } from "@/orders/components/order-row";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  let me = null;
  try {
    me = await currentCustomer();
  } catch (error) {
    console.error("[orders] Failed to resolve customer", error);
  }

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

  let rows: OrderRowData[] = [];
  try {
    const { orders } = await readMyOrders();
    rows = orderRows(orders ?? []);
  } catch (error) {
    console.error("[orders] Failed to read orders", error);
  }

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

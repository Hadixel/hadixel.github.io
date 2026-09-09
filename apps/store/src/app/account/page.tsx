import { currentCustomer } from "@/lib/auth";
import { db } from "@kmodern/db";
import { orderStatusKey, type OrderRowData } from "@/components/order-row";
import AccountLogin from "./account-login";
import { AccountArea } from "./account-area";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await currentCustomer();
  if (!me) {
    return <AccountLogin />;
  }
  const orders = await db().order.findMany({
    where: { customerId: me.customer.id },
    orderBy: { placedAt: "desc" },
    include: { items: true },
    take: 50,
  });
  const recent: OrderRowData[] = orders.slice(0, 4).map((o) => ({
    orderNumber: o.orderNumber,
    placedAt: o.placedAt.toISOString(),
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
    total: o.total,
    statusKey: orderStatusKey({ fulfillmentStatus: o.fulfillmentStatus, paymentStatus: o.paymentStatus }),
  }));
  return <AccountArea phone={me.customer.phone} orderCount={orders.length} recentOrders={recent} />;
}

import { currentCustomer } from "@/account/lib/customer-session";
import { readMyOrders, recentOrderRows, type OrderSummary } from "@/orders/lib/my-orders";
import AccountLogin from "@/account/components/account-login";
import { AccountArea } from "@/account/components/account-area";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  let me = null;
  try {
    me = await currentCustomer();
  } catch (error) {
    console.error("[account] Failed to resolve current customer, defaulting to login", error);
  }

  if (!me) {
    return <AccountLogin />;
  }

  let orders: OrderSummary[] = [];
  let total = 0;
  try {
    const res = await readMyOrders();
    orders = res.orders ?? [];
    total = res.total ?? 0;
  } catch (error) {
    console.error("[account] Failed to read customer orders, defaulting to empty list", error);
  }

  return <AccountArea phone={me.customer.phone} orderCount={total} recentOrders={recentOrderRows(orders)} />;
}

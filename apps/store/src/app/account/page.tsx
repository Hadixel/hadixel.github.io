import { currentCustomer } from "@/lib/customer-session";
import { readMyOrders, recentOrderRows } from "@/lib/my-orders";
import AccountLogin from "./account-login";
import { AccountArea } from "./account-area";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await currentCustomer();
  if (!me) {
    return <AccountLogin />;
  }
  // The gateway answers with the four fields this page prints and the count of all the shopper's
  // orders. It used to query the order table here and sum the quantities itself, so the number of
  // orders an account page reported was the number of rows it had been handed — fifty for anybody
  // with a longer history than that.
  const { orders, total } = await readMyOrders();
  return <AccountArea phone={me.customer.phone} orderCount={total} recentOrders={recentOrderRows(orders)} />;
}

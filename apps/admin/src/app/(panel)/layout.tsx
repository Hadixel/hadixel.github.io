import { redirect } from "next/navigation";
import { db } from "@kmodern/db";
import { getAdminUser } from "@/lib/auth";
import { getSettingOrDefault } from "@/lib/settings";
import { settingKeys } from "@kmodern/schema/setting-keys";
import { AdminShell } from "@/components/shell";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAdminUser();
  if (!ctx) redirect("/login");
  if (ctx.admin.mustChangePassword) redirect("/change-password");

  const [ordersAwaiting, lowStock] = await Promise.all([
    db().order.count({ where: { paymentStatus: "AWAITING" } }),
    (async () => {
      const threshold = await getSettingOrDefault<number>(settingKeys.inventoryLowStockThreshold, 3);
      return db().variant.count({ where: { stock: { lte: threshold } } });
    })(),
  ]);

  return (
    <AdminShell
      ordersAwaiting={ordersAwaiting}
      lowStock={lowStock}
      isOwner={ctx.admin.role === "OWNER"}
      name={ctx.admin.name}
      email={ctx.admin.email}
    >
      {children}
    </AdminShell>
  );
}
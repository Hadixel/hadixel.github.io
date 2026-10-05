import { redirect } from "next/navigation";
import { getAdminUser } from "@/auth/lib/auth";
import { readThrough } from "@/lib/reads";
import { AdminShell } from "@/components/shell";

// The shell's two badges, asked for on their own.
//
// The badge read is separate from the dashboard's because the badge is on *every* panel page. Asking
// for the landing page's figures instead would mean ten low-stock rows and five orders on every screen
// in the shop's back office to draw two numbers in a sidebar.
//
// The operator check is this layout's own, and it stays here rather than becoming a gateway rule: the
// redirect is a panel decision — where an operator without a session goes is the panel's business — and
// the forced-password-change gate is a page-level concern. What the gateway owns is whether the
// session is valid at all, which `getAdminUser` now asks it.

/**
 * Never prerender anything under the panel.
 *
 * Every page here is behind an operator's session cookie, so not one of them can be rendered at build
 * time — and a build that tries will call the gateway with no cookie, read the failure as "the gateway
 * is down", and fail on a route that is perfectly correct at runtime. Reading the cookie used to make
 * this automatic; the session check now happens inside the gateway, and a build-time render of this
 * layout has no way to tell "no operator here" from "cannot ask".
 */
export const dynamic = "force-dynamic";
// The badge read is separate from the dashboard's because the badge is on *every* panel page. Asking
// for the landing page's figures instead would mean ten low-stock rows and five orders on every screen
// in the shop's back office to draw two numbers in a sidebar.
//
// The operator check is this layout's own, and it stays here rather than becoming a gateway rule: the
// redirect is a panel decision — where an operator without a session goes is the panel's business — and
// the forced-password-change gate is a page-level concern. What the gateway owns is whether the
// session is valid at all, which `getAdminUser` now asks it.
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAdminUser();
  if (!ctx) redirect("/login");
  if (ctx.admin.mustChangePassword) redirect("/change-password");

  const badges = await readThrough<{ awaitingOrders: number; lowStock: number }>("/dashboard/badges");

  return (
    <AdminShell
      ordersAwaiting={badges.awaitingOrders}
      lowStock={badges.lowStock}
      isOwner={ctx.admin.role === "OWNER"}
      name={ctx.admin.name}
      email={ctx.admin.email}
    >
      {children}
    </AdminShell>
  );
}

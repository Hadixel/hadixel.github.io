import { NextRequest, NextResponse } from "next/server";
import { db } from "@kmodern/db";
import { zarinpalConfigFromEnv, requestPayment } from "@kmodern/adapters";
import { currentCustomer } from "@/lib/auth";
import { getSettingOrDefault } from "@/lib/settings";
import { settingKeys } from "@kmodern/schema/setting-keys";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentCustomer();
  const { id } = await params;
  if (!me) return NextResponse.json({ error: "ابتدا وارد شوید" }, { status: 401 });

  const order = await db().order.findFirst({
    where: { id, customerId: me.customer.id, paymentStatus: "AWAITING", paymentMethod: "ONLINE" },
  });
  if (!order) return NextResponse.json({ error: "سفارش در انتظار پرداخت یافت نشد" }, { status: 404 });

  const cfg = zarinpalConfigFromEnv();
  if (!cfg) return NextResponse.json({ error: "درگاه پرداخت پیکربندی نشده است" }, { status: 503 });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const callbackUrl = `${baseUrl}/api/orders/${id}/pay/callback`;

  // 011: payment window — expired reservation releases stock
  const reserveMins = await getSettingOrDefault<number>(settingKeys.checkoutOnlineReserveMinutes, 30);
  const expiresAt = new Date(Date.now() + reserveMins * 60_000);
  await db().order.update({ where: { id }, data: { paymentExpiresAt: expiresAt } });

  const res = await requestPayment(cfg, {
    amountRial: order.total * 10, // 011: TOMAN→Rial at gateway
    description: `سفارش ${order.orderNumber}`,
    callbackUrl,
    orderId: order.orderNumber,
  });

  await db().order.update({ where: { id }, data: { gatewayAuthority: res.authority } });

  return NextResponse.json({ ok: true, authority: res.authority, url: res.startPayUrl });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // return pay status for client polling
  const { id } = await params;
  const me = await currentCustomer();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const order = await db().order.findFirst({
    where: { id, customerId: me.customer.id },
    select: { paymentStatus: true, gatewayAuthority: true, paymentExpiresAt: true },
  });
  return NextResponse.json({ order });
}
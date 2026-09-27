import { NextRequest, NextResponse } from "next/server";
import { commitStock, db, recordOrderEvent, releaseStock } from "@kmodern/db";
import { tomanToRial } from "@kmodern/schema";
import { zarinpalConfigFromEnv, verifyPayment } from "@kmodern/adapters";
import { kavenegarConfigFromEnv, sendLookup } from "@kmodern/adapters";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await db().order.findUnique({ where: { id }, include: { customer: true } });
  if (!order) return NextResponse.redirect(new URL("/", req.url));

  const authority = req.nextUrl.searchParams.get("Authority");
  const status = req.nextUrl.searchParams.get("Status");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  if (status !== "OK" || !authority) {
    await releaseStock(order.id);
    await db().order.update({ where: { id }, data: { paymentStatus: "FAILED" } });
    await recordOrderEvent({
      orderId: order.id, dimension: "PAYMENT", from: "AWAITING", to: "FAILED",
      actor: "SYSTEM", note: "پرداخت لغو شد",
    });
    return NextResponse.redirect(new URL(`/order/${order.orderNumber}?payment=failed`, baseUrl));
  }

  const cfg = zarinpalConfigFromEnv();
  if (!cfg) return NextResponse.redirect(new URL(`/order/${order.orderNumber}?payment=error`, baseUrl));

  // Verified against the shared conversion of the order total, which is the same number the payment
  // request asked for. Two hand-written factors either side of this boundary is how a payment verifies
  // against an amount the customer was never charged.
  const verify = await verifyPayment(cfg, authority, tomanToRial(order.total));
  if (verify.code === 100 || verify.code === 101) {
    // commit: stock -= reserved
    await commitStock(order.id);
    await db().order.update({
      where: { id },
      data: { paymentStatus: "PAID", gatewayRefId: verify.refId },
    });
    await recordOrderEvent({
      orderId: order.id, dimension: "PAYMENT", from: "AWAITING", to: "PAID",
      actor: "SYSTEM", note: `پرداخت تایید شد (${verify.refId})`,
    });
    if (order.customer) {
      const sms = kavenegarConfigFromEnv();
      if (sms) {
        try {
          await sendLookup(sms, {
            phone: order.customer.phone, template: "orderpaid",
            tokens: [order.orderNumber, String(Math.round(order.total))],
          });
        } catch { /* non-blocking */ }
      }
    }
    return NextResponse.redirect(new URL(`/order/${order.orderNumber}?payment=success`, baseUrl));
  }

  // double-spend / mismatch
  await releaseStock(order.id);
  await db().order.update({ where: { id }, data: { paymentStatus: "FAILED" } });
  await recordOrderEvent({
    orderId: order.id, dimension: "PAYMENT", from: "AWAITING", to: "FAILED",
    actor: "SYSTEM", note: "تایید پرداخت ناموفق",
  });
  return NextResponse.redirect(new URL(`/order/${order.orderNumber}?payment=failed`, baseUrl));
}
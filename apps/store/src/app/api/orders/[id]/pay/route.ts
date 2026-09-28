import { NextRequest, NextResponse } from "next/server";
import { GatewayError } from "@kmodern/transport/client";
import { zarinpalConfigFromEnv, requestPayment } from "@kmodern/adapters";
import { gateway } from "@/lib/gateway";

// The payment window, and the provider call that has to happen inside it.
//
// What this route still does, and why: it holds the merchant credentials, so calling the payment
// provider is its job and not the gateway's. What it no longer does is decide anything about the
// order. It used to query the order table for the total, decide for itself whether the order was the
// caller's and still payable, read the shop's reserve setting, convert TOMAN to Rial, and write the
// window's expiry and the provider's reference back — five facts about one order, spread across this
// handler, and the caller of it deciding who may pay for what.
//
// All of that is the gateway's now, scoped to the shopper's own session. The one thing this route
// still forms is the callback URL, because where the provider sends a shopper back is this app's
// business and not the gateway's.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await gateway();

  let payable: { id: string; orderNumber: string; amountRial: number };
  try {
    payable = await client.post<{ id: string; orderNumber: string; amountRial: number }>(
      `/shopper/orders/${encodeURIComponent(id)}/payment-window`,
    );
  } catch (error) {
    if (error instanceof GatewayError && error.unauthorized) {
      return NextResponse.json({ error: "ابتدا وارد شوید" }, { status: 401 });
    }
    // Someone else's order, an order already paid, and an order that is not paid online all answer
    // the same way, and this route passes that answer on rather than inventing a reason for it.
    if (error instanceof GatewayError && error.statusCode === 404) {
      return NextResponse.json({ error: "سفارش در انتظار پرداخت یافت نشد" }, { status: 404 });
    }
    return NextResponse.json({ error: "شروع پرداخت انجام نشد؛ دوباره تلاش کنید." }, { status: 502 });
  }

  const cfg = zarinpalConfigFromEnv();
  if (!cfg) return NextResponse.json({ error: "درگاه پرداخت پیکربندی نشده است" }, { status: 503 });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const callbackUrl = `${baseUrl}/api/orders/${id}/pay/callback`;

  const res = await requestPayment(cfg, {
    // The gateway's figure, in the unit the provider wants. It used to be converted here with the
    // shared helper while the callback that verifies it converted the same total again, which is how
    // a boundary ends up asking to charge one amount and verifying against another (011).
    amountRial: payable.amountRial,
    description: `سفارش ${payable.orderNumber}`,
    callbackUrl,
    orderId: payable.orderNumber,
  });

  // The provider's reference belongs to the order, so the gateway records it — against the same
  // scoped write as the window itself, and behind the same session check.
  try {
    await client.post(`/shopper/orders/${encodeURIComponent(id)}/payment-window/authority`, {
      authority: res.authority,
    });
  } catch {
    // The window is open either way and the callback carries the authority with it, so a failure
    // here costs the order its reference for the operator and nothing else. Failing the whole
    // request would send a shopper away from a payment they can still make.
  }

  return NextResponse.json({ ok: true, authority: res.authority, url: res.startPayUrl });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const client = await gateway();
    const window = await client.get<{
      paymentStatus: string;
      paymentLabel: string;
      authority: string | null;
      expiresAt: string | null;
    }>(`/shopper/orders/${encodeURIComponent(id)}/payment-window`);
    return NextResponse.json({ order: window });
  } catch (error) {
    if (error instanceof GatewayError && error.unauthorized) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (error instanceof GatewayError && error.statusCode === 404) {
      return NextResponse.json({ order: null }, { status: 404 });
    }
    throw error;
  }
}

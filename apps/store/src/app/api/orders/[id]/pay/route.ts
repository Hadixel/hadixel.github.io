import { NextRequest, NextResponse } from "next/server";
import { GatewayError } from "@kmodern/transport/client";
import { gateway } from "@/lib/gateway";

// The payment window, and the provider call that has to happen inside it.
//
// The last thing this route did itself was call the payment provider, on the grounds that the merchant
// credentials made it this app's job. They did not: they made it *two* processes' job, which is how the
// storefront and the gateway could be configured to disagree about whether online payment works — and a
// checkout page offering a method the gateway would then refuse is a shopper stuck mid-payment.
//
// So the gateway opens the window, resolves the amount from the order, calls the provider and records
// the reference it gets back, in one call. The merchant's credentials now exist in exactly one process.
//
// The one thing left here is where the provider sends the shopper back, because the gateway does not
// render the page they land on and has no business naming it.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await gateway();

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const callbackUrl = `${baseUrl}/api/orders/${encodeURIComponent(id)}/pay/callback`;

  try {
    const { authority, startPayUrl } = await client.post<{
      authority: string;
      startPayUrl: string;
    }>(`/shopper/orders/${encodeURIComponent(id)}/payment-start`, { callbackUrl });
    return NextResponse.json({ ok: true, authority, url: startPayUrl });
  } catch (error) {
    if (error instanceof GatewayError && error.unauthorized) {
      return NextResponse.json({ error: "ابتدا وارد شوید" }, { status: 401 });
    }
    // Someone else's order, an order already paid, and an order that is not paid online all answer
    // the same way, and this route passes that answer on rather than inventing a reason for it.
    if (error instanceof GatewayError && error.statusCode === 404) {
      return NextResponse.json({ error: "سفارش در انتظار پرداخت یافت نشد" }, { status: 404 });
    }
    // The provider is not configured. A 503 and not a 502: nothing is wrong with the request and
    // retrying will not help, which is a different thing for a shopper to be told than "try again".
    if (error instanceof GatewayError && error.statusCode === 503) {
      return NextResponse.json({ error: "درگاه پرداخت پیکربندی نشده است" }, { status: 503 });
    }
    return NextResponse.json({ error: "شروع پرداخت انجام نشد؛ دوباره تلاش کنید." }, { status: 502 });
  }
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

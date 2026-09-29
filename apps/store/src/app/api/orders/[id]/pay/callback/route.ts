import { NextRequest, NextResponse } from "next/server";
import { GatewayError } from "@kmodern/transport/client";
import { gateway } from "@/lib/gateway";

// The payment provider redirecting a shopper back, and the settlement that follows.
//
// Verification and settlement are one call to the gateway now, and the reason is the thing this route
// used to get wrong by being able to: it fetched the order's total, converted it, and asked the
// provider to confirm that amount — then handed the outcome to a *different* gateway route to settle.
// Two requests, two numbers, and nothing tying the amount that was verified to the amount the order
// records. Both are now resolved in the one process that holds the order, the credentials and the
// settlement's compare-and-set, so the amount verified is the amount charged.
//
// What stays here is the only part that is this app's business: where the shopper lands afterwards, and
// what they are told. Whether the payment succeeded is the provider's answer, and how the order records
// it is the gateway's.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authority = req.nextUrl.searchParams.get("Authority");
  const status = req.nextUrl.searchParams.get("Status");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  const orderNumber = await orderNumberFor(id);

  // The provider's own "no": nothing to verify, and nothing is settled. The order keeps its hold and
  // expires on its own, which is the same outcome as a shopper who closed the tab.
  if (status !== "OK" || !authority) {
    await settle(id, "FAILED");
    return redirect(baseUrl, orderNumber, "failed");
  }

  let result: { outcome: "PAID" | "FAILED"; settlement: string; refId?: string };
  try {
    const client = await gateway();
    result = await client.post<typeof result>(
      `/shopper/orders/${encodeURIComponent(id)}/payment-verify`,
      { authority },
    );
  } catch {
    // The provider could not be reached or refused the authority. Nothing has been settled either way,
    // and the shopper gets the same page a failed payment gets rather than a stack trace.
    return redirect(baseUrl, orderNumber, "error");
  }

  if (result.outcome === "FAILED") {
    return redirect(baseUrl, orderNumber, "failed");
  }

  // "already" is a duplicate callback arriving after a successful one — the expected answer when a
  // shopper refreshes the redirect, not a fault. Both send them to the same place a first success does.
  if (result.settlement === "hold-lost") {
    return redirect(baseUrl, orderNumber, "error");
  }

  return redirect(baseUrl, orderNumber, "success");
}

async function settle(orderId: string, outcome: "PAID" | "FAILED"): Promise<void> {
  try {
    const client = await gateway();
    await client.post(`/orders/mine/${encodeURIComponent(orderId)}/payment`, { outcome });
  } catch {
    // Deliberately swallowed, and the reason is specific. This is the provider declining before any
    // verification happened, so the order has not been settled either way. The hold expires on its own
    // and the shopper is redirected to a page that says the payment did not complete. Failing the
    // request instead would show them an error page for something the gateway has already recorded by
    // the order's own expiry.
  }
}

async function orderNumberFor(orderId: string): Promise<string | null> {
  try {
    const client = await gateway();
    const order = await client.get<{ orderNumber: string }>(`/orders/mine/${encodeURIComponent(orderId)}`);
    return order.orderNumber;
  } catch {
    return null;
  }
}

function redirect(baseUrl: string, orderNumber: string | null, payment: string): NextResponse {
  const where = orderNumber ? `/order/${orderNumber}?payment=${payment}` : `/?payment=${payment}`;
  return NextResponse.redirect(new URL(where, baseUrl));
}

import { NextRequest, NextResponse } from "next/server";
import { GatewayError } from "@kmodern/transport/client";
import { tomanToRial } from "@kmodern/schema";
import { zarinpalConfigFromEnv, verifyPayment } from "@kmodern/adapters";
import { gateway } from "@/lib/gateway";

// The payment provider redirecting a shopper back, and the settlement that follows.
//
// What this route still does, and why: it holds the merchant credentials, so verifying the provider's
// signature is its job and not the gateway's. What it no longer does is decide what the verification
// means. It used to:
//
//   - commit the held stock,
//   - write `paymentStatus`,
//   - record the order event,
//
// as three writes with nothing holding them together, and its cancellation path released stock with no
// condition at all — so a callback arriving after a successful one took a paid order's units off the
// shelf. All of that is now one transaction in the gateway, taken with a compare-and-set on the order's
// payment status, and this route asks for it.
//
// A duplicate callback is now an ordinary answer rather than a fault: the gateway reports that the
// settlement was already applied, and the shopper is redirected exactly as they would have been.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authority = req.nextUrl.searchParams.get("Authority");
  const status = req.nextUrl.searchParams.get("Status");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  // Where to send the shopper, and what to tell them, is this app's business. Whether the payment
  // succeeded is the provider's, and how the order records that is the gateway's.
  const orderNumber = await orderNumberFor(id);

  if (status !== "OK" || !authority) {
    await settle(id, "FAILED");
    return redirect(baseUrl, orderNumber, "failed");
  }

  const config = zarinpalConfigFromEnv();
  if (!config) {
    // Not a payment failure and not a settlement: the merchant has no provider configured. The order is
    // left awaiting payment and the shopper is told the shop is misconfigured, which is the truth.
    return redirect(baseUrl, orderNumber, "error");
  }

  // Verified against the shared conversion of the order's total, which is the same number the payment
  // request asked for. Two hand-written factors either side of this boundary is how a payment verifies
  // against an amount the customer was never charged.
  const amount = await orderTotalFor(id);
  if (amount === null) return redirect(baseUrl, orderNumber, "error");

  let verified = false;
  let refId: string | undefined;
  try {
    const result = await verifyPayment(config, authority, tomanToRial(amount));
    // 100 is a fresh success; 101 means the provider already saw this authority, which for a duplicate
    // redirect is the expected answer rather than a problem.
    verified = result.code === 100 || result.code === 101;
    refId = result.refId;
  } catch {
    return redirect(baseUrl, orderNumber, "error");
  }

  if (!verified) {
    await settle(id, "FAILED");
    return redirect(baseUrl, orderNumber, "failed");
  }

  const settled = await settle(id, "PAID", refId);
  if (settled === "hold-lost") {
    // The money arrived for an order whose hold is gone. The gateway refused to record it, and the
    // shopper must not be told it succeeded.
    return redirect(baseUrl, orderNumber, "error");
  }
  return redirect(baseUrl, orderNumber, "success");
}

type SettlementOutcome = "settled" | "already" | "conflict" | "hold-lost";

async function settle(
  orderId: string,
  outcome: "PAID" | "FAILED",
  refId?: string,
): Promise<SettlementOutcome> {
  try {
    const client = await gateway();
    const result = await client.post<{ kind: SettlementOutcome }>(
      `/orders/mine/${encodeURIComponent(orderId)}/payment`,
      { outcome, ...(refId ? { refId } : {}) },
    );
    return result.kind;
  } catch (error) {
    if (error instanceof GatewayError && error.statusCode === 409) return "hold-lost";
    // A gateway that cannot be reached has not settled anything, and the hold expires on its own. The
    // shopper is redirected rather than shown a stack trace, and the order is still awaiting payment.
    return "conflict";
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

async function orderTotalFor(orderId: string): Promise<number | null> {
  try {
    const client = await gateway();
    const order = await client.get<{ total: number }>(`/orders/mine/${encodeURIComponent(orderId)}`);
    return order.total;
  } catch {
    return null;
  }
}

function redirect(baseUrl: string, orderNumber: string | null, payment: string): NextResponse {
  const where = orderNumber ? `/order/${orderNumber}?payment=${payment}` : `/?payment=${payment}`;
  return NextResponse.redirect(new URL(where, baseUrl));
}

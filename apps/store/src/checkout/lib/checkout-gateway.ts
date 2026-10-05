import { NextRequest, NextResponse } from "next/server";
import { GatewayError } from "@kmodern/transport/client";
import { gateway, type ResolvedBlock } from "@/lib/gateway";

// The two checkout steps, as gateway calls.
//
// Nothing here decides anything. The COD eligibility rule, the ceiling, the one-unpaid-order rule, the
// city/province agreement check and the stock check were all inlined in this handler; they are in the
// gateway, which is why a request to this route can no longer place an order those rules would refuse.
//
// The address and the basket are forwarded as the shopper sent them, unvalidated here. Validating a
// second time with a second rule set is how the preview and the order came to disagree about whether a
// city belongs to a province — the check existed on the preview path only, and the create path skipped
// it entirely.

export interface CheckoutQuoteResponse {
  totals: {
    subtotal: number;
    discountAmount: number;
    deliveryFee: number;
    total: number;
    freeDelivery: boolean;
    shippingMethod: string;
    deliveryFeeMode: string;
    shippingNote?: string;
    couponError?: string;
  };
  weightKg: number;
}

export interface PlacedOrderResponse {
  id: string;
  orderNumber: string;
  total: number;
  paymentMethod: string;
  shippingMethod: string;
  deliveryFee: number;
  couponError?: string;
}

/**
 * The gateway's answer, forwarded.
 *
 * Status and Persian message go back as the gateway sent them. A checkout rule the shopper needs to know
 * about is the gateway's to word, and re-wording it here is how a shopper gets a message the server
 * never said.
 */
export function gatewayFailure(error: unknown): NextResponse {
  if (error instanceof GatewayError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
  return NextResponse.json({ error: "ثبت سفارش انجام نشد؛ دوباره تلاش کنید" }, { status: 500 });
}

/** What the basket would cost to deliver. */
export async function quoteBasket(body: unknown): Promise<NextResponse> {
  try {
    const client = await gateway();
    const quote = await client.post<CheckoutQuoteResponse>("/checkout/quote", body);
    return NextResponse.json(quote);
  } catch (error) {
    return gatewayFailure(error);
  }
}

/** Place the order. */
export async function placeOrder(body: unknown): Promise<NextResponse> {
  try {
    const client = await gateway();
    const placed = await client.post<PlacedOrderResponse>("/checkout", body);
    return NextResponse.json({ ok: true, order: placed });
  } catch (error) {
    return gatewayFailure(error);
  }
}

export async function readBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export type { ResolvedBlock };

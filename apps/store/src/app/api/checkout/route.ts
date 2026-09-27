import { NextRequest, NextResponse } from "next/server";
import { placeOrder, readBody } from "./gateway";

// Placing an order, through the gateway.
//
// The version that was here queried the variants, built the order context, checked stock, derived the
// shipping method, applied discounts, enforced the cash-on-delivery ceiling and the one-unpaid-order
// rule, allocated the order number, created the order, reserved the stock and committed it for
// cash on delivery — six rules, five of which the gateway now owns and one of which (the city/province
// agreement) existed only on the preview path, so this handler never checked it at all.
//
// What is left decides nothing. It forwards the request and returns the gateway's answer, status and
// Persian message included.

export async function POST(req: NextRequest) {
  const body = await readBody(req);
  if (body === null) {
    return NextResponse.json({ error: "بدنه درخواست نامعتبر است" }, { status: 400 });
  }
  return placeOrder(body);
}

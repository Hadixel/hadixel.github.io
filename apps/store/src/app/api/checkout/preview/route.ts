import { NextRequest, NextResponse } from "next/server";
import { quoteBasket, readBody } from "../gateway";

// What the basket would cost to deliver, through the gateway.
//
// The city/province agreement check used to be here and nowhere else, which is why calling the route
// that actually creates an order skipped it. The check is now in the gateway, on both paths, because
// they are the same code path: the quote is the first half of the order's computation.

export async function POST(req: NextRequest) {
  const body = await readBody(req);
  if (body === null) {
    return NextResponse.json({ error: "بدنه درخواست نامعتبر است" }, { status: 400 });
  }
  return quoteBasket(body);
}

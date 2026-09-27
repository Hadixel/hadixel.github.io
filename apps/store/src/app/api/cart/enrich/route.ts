import { NextRequest, NextResponse } from "next/server";
import { GatewayError } from "@kmodern/transport/client";
import { gateway } from "@/lib/gateway";

// Enriching a basket, through the gateway.
//
// The cart cookie is a list of variant ids the browser kept, so it ages: a variant is unpublished, a
// price moves, a line sells out. This used to resolve that list against the database, which meant the
// storefront knew the variant and category tables well enough to reproduce the gateway's idea of what is
// sellable — and the two definitions of "available" were not the same expression.
//
// A line the gateway cannot resolve is reported rather than dropped, so a cart that has quietly changed
// says what is missing instead of shrinking.

export interface EnrichedLine {
  variantId: string;
  productId: string;
  slug: string;
  productName: string;
  colorName: string | null;
  sku: string | null;
  price: number;
  qty: number;
  lineTotal: number;
  image: string | null;
  available: boolean;
  maxAddable: number;
}

export interface EnrichedCart {
  lines: EnrichedLine[];
  subtotal: number;
  totalCount: number;
  unavailable: { variantId: string; qty: number }[];
}

export async function POST(req: NextRequest) {
  let items: { variantId: string; qty: number }[];
  try {
    items = (await req.json()) as { variantId: string; qty: number }[];
    if (!Array.isArray(items)) throw new Error("not an array");
  } catch {
    return NextResponse.json({ error: "سبد خرید نامعتبر است" }, { status: 400 });
  }

  try {
    const client = await gateway();
    const cart = await client.post<EnrichedCart>("/cart/enrich", { items });
    return NextResponse.json({
      lines: cart.lines,
      subtotal: cart.subtotal,
      // The storefront's own name, kept so the cart page does not have to learn the gateway's. The rule
      // is now the gateway's; only the label the page already used is preserved.
      rejectedVariantIds: cart.unavailable.map((line) => line.variantId),
    });
  } catch (error) {
    if (error instanceof GatewayError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
    }
    return NextResponse.json({ error: "سبد خرید خوانده نشد" }, { status: 500 });
  }
}

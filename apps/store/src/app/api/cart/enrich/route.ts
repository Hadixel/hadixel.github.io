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
  productSlug?: string;
  productName: string;
  colorName: string | null;
  sku: string | null;
  price: number;
  qty: number;
  lineTotal: number;
  image: string | null;
  available: boolean;
  maxAddable: number;
  allowBackorder?: boolean;
  stock?: number;
  reserved?: number;
}

export interface EnrichedCart {
  lines: EnrichedLine[];
  subtotal: number;
  totalCount: number;
  unavailable: { variantId: string; qty: number }[];
}

export async function POST(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "سبد خرید نامعتبر است" }, { status: 400 });
  }

  const rawList = Array.isArray(rawBody)
    ? rawBody
    : (rawBody && typeof rawBody === "object" && Array.isArray((rawBody as { items?: unknown }).items))
      ? (rawBody as { items: unknown[] }).items
      : null;

  if (!rawList) {
    return NextResponse.json({ error: "سبد خرید نامعتبر است" }, { status: 400 });
  }

  const items: { variantId: string; qty: number }[] = rawList
    .filter(
      (item): item is { variantId: string; qty?: unknown } =>
        Boolean(item && typeof item === "object" && typeof (item as { variantId?: unknown }).variantId === "string" && (item as { variantId: string }).variantId.trim().length > 0)
    )
    .map((item) => ({
      variantId: item.variantId.trim(),
      qty: typeof item.qty === "number" && Number.isFinite(item.qty) && item.qty >= 1 ? Math.min(99, Math.floor(item.qty)) : 1,
    }));

  if (items.length === 0) {
    return NextResponse.json({
      lines: [],
      subtotal: 0,
      rejectedVariantIds: [],
    });
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

import { NextRequest, NextResponse } from "next/server";
import { db } from "@kmodern/db";
import { cartItemSchema } from "@/lib/cart";
import { z } from "zod";

// Enrich cart lines with current price/stock/name/image for the cart page.
export async function POST(req: NextRequest) {
  let items;
  try {
    items = z.array(cartItemSchema).parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid cart" }, { status: 400 });
  }
  const ids = items.map((i) => i.variantId);
  const variants = await db().variant.findMany({
    where: { id: { in: ids } },
    include: { product: { include: { category: true } } },
  });
  const map = new Map(variants.map((v) => [v.id, v]));
  const lines: Array<{
    variantId: string; qty: number; sku: string; colorName: string; price: number;
    stock: number; reserved: number; allowBackorder: boolean; productName: string;
    productSlug: string; categoryWeightKg: number; image: string | null; lineTotal: number; available: boolean;
  }> = [];
  for (const it of items) {
    const v = map.get(it.variantId);
    if (!v) continue;
    lines.push({
      variantId: v.id,
      qty: it.qty,
      sku: v.sku,
      colorName: v.colorName,
      price: v.price,
      stock: v.stock,
      reserved: v.reserved,
      allowBackorder: v.allowBackorder,
      productName: v.product.name,
      productSlug: v.product.slug,
      categoryWeightKg: v.product.category.weightKg,
      image: v.images[0] ?? null,
      lineTotal: v.price * it.qty,
      available: v.allowBackorder || v.stock - v.reserved >= it.qty,
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  return NextResponse.json({ lines, subtotal });
}
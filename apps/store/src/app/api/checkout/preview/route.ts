import { NextRequest, NextResponse } from "next/server";
import { db } from "@kmodern/db";
import { z } from "zod";
import { addressSchema, cityBelongsToProvince } from "@kmodern/schema";
import { currentCustomer } from "@/lib/auth";
import { buildOrderContext, computeOrderTotals } from "@/lib/orders";
import { cartItemSchema } from "@/lib/cart";

// Checkout step 1: given address + cart, compute shipping method + totals
// WITHOUT placing. (011: method is derived, not user-picked.)
const previewSchema = z.object({
  address: addressSchema,
  items: z.array(cartItemSchema).min(1),
  couponCode: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = previewSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("، ") }, { status: 400 });
  }
  const { address, items, couponCode } = parsed.data;

  // validate province/city pair against Iran dataset
  if (!cityBelongsToProvince(address.province, address.city)) {
    return NextResponse.json({ error: "شهر انتخابی با استان همخوانی ندارد" }, { status: 400 });
  }

  const lines = await buildOrderContext(items);
  const me = await currentCustomer();
  const totals = await computeOrderTotals(lines, address.province, address.city, me?.customer.id ?? "guest", couponCode);

  return NextResponse.json({ totals, weightKg: lines.reduce((s, l) => s + l.weightKg * l.qty, 0) });
}
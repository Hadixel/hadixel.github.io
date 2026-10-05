import { z } from "zod";

// Cart items: variantId + qty. Validated server-side at place (011).
export const cartItemSchema = z.object({
  variantId: z.string().min(1),
  qty: z.number().int().min(1).max(99),
});

export type CartItemInput = z.infer<typeof cartItemSchema>;

export const cartShapeSchema = z.object({
  items: z.array(cartItemSchema).default([]),
});

export type CartShape = z.infer<typeof cartShapeSchema>;

// Cart is stored in a signed httpOnly cookie on the store app (device cart,
// per 011 merge-or-keep at checkout). Shape is serialized JSON.
export const CART_COOKIE = "kmodern_cart";

export function serializeCart(items: CartItemInput[]): string {
  return JSON.stringify({ items });
}

export function parseCart(raw: string | undefined): CartItemInput[] {
  if (!raw) return [];
  const parsed = cartShapeSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data.items : [];
}
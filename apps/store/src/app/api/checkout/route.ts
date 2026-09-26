import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { commitStock, db, Prisma, recordOrderEvent, reserveStock } from "@kmodern/db";
import { addressSchema } from "@kmodern/schema";
import { settingKeys } from "@kmodern/schema/setting-keys";
import { currentCustomer } from "@/lib/auth";
import { buildOrderContext, assertStock, nextOrderNumber, computeOrderTotals } from "@/lib/orders";
import { getSettingOrDefault } from "@/lib/settings";
import { kavenegarConfigFromEnv, sendLookup } from "@kmodern/adapters";
import { cartItemSchema } from "@/lib/cart";

const placeSchema = z.object({
  address: addressSchema,
  items: z.array(cartItemSchema).min(1),
  paymentMethod: z.enum(["ONLINE", "CARD_TO_CARD", "COD"]),
  couponCode: z.string().optional(),
  keepAccountCart: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  // 011 auth wall: place order requires a verified session
  const me = await currentCustomer();
  if (!me) return NextResponse.json({ error: "ابتدا وارد شوید" }, { status: 401 });

  const parsed = placeSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("، ") }, { status: 400 });
  }
  const { address, items, paymentMethod, couponCode } = parsed.data;

  try {
    // 011: reject if postal code's city ≠ selected city (province/city agreement)
    // (full code↔city prefix mapping is a documented seam; format enforced here)

    // stock check against live variants
    const variantIds = items.map((i) => i.variantId);
    const variants = await db().variant.findMany({
      where: { id: { in: variantIds } },
      include: { product: { select: { name: true } } },
    });
    if (variants.length !== variantIds.length) {
      return NextResponse.json({ error: "محصولی یافت نشد" }, { status: 400 });
    }
    const lines = await buildOrderContext(items);
    assertStock(lines, items, variants);

    // shipping method gating (011): COD only when LOCAL
    const totals = await computeOrderTotals(lines, address.province, address.city, me.customer.id, couponCode);
    if (paymentMethod === "COD" && totals.shippingMethod !== "LOCAL") {
      return NextResponse.json({ error: "پرداخت هنگام تحویل فقط برای ارسال درونشهری کرمان فعال است" }, { status: 400 });
    }
    if (paymentMethod === "COD") {
      const maxCod = await getSettingOrDefault<number>(settingKeys.shippingMaxCodTotal, 50000000);
      if (totals.total > maxCod) {
        return NextResponse.json({ error: "سقف پرداخت هنگام تحویل بیشتر از مبلغ سفارش است" }, { status: 400 });
      }
    }

    // 011: at most one AWAITING order per customer
    const awaiting = await db().order.findFirst({
      where: { customerId: me.customer.id, paymentStatus: "AWAITING" },
    });
    if (awaiting && paymentMethod !== "COD") {
      // allow proceed; will cancel old on place? 011: at most one AWAITING — block
      return NextResponse.json({ error: "یک سفارش در انتظار پرداخت دارید" }, { status: 400 });
    }

    const orderNumber = await nextOrderNumber();
    const order = await db().order.create({
      data: {
        orderNumber,
        customerId: me.customer.id,
        shippingAddress: address as unknown as object,
        fulfillmentStatus: "PENDING",
        paymentStatus: "AWAITING",
        paymentMethod,
        shippingMethod: totals.shippingMethod ?? "BARBERI",
        deliveryFeeMode: totals.deliveryFeeMode ?? "FLAT",
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        appliedDiscounts: totals.appliedDiscounts as unknown as Prisma.InputJsonValue,
        deliveryFee: totals.deliveryFee,
        total: totals.total,
        currency: "TOMAN",
        items: {
          create: lines.map((l, idx) => {
            const it = items[idx];
            const v = variants.find((x) => x.id === l.variantId);
            return {
              productId: l.productId,
              variantId: l.variantId,
              productName: v?.product?.name ?? "",
              colorName: v?.colorName,
              sku: v?.sku ?? "",
              unitPrice: l.price,
              quantity: it.qty,
              lineTotal: l.price * it.qty,
              image: v?.images?.[0] ?? null,
            };
          }),
        },
      },
    });

    // Every payment method goes through the one lifecycle in the data tier. Cash on delivery
    // reserves and commits in the same transaction as the order-status change, so a COD order
    // can no longer leave stock decremented for some lines and not others — and it no longer
    // hardcodes a 48-hour window instead of reading the merchant's setting.
    await db().$transaction(async (tx) => {
      await reserveStock(order.id, lines, paymentMethod, undefined, tx);
      if (paymentMethod === "COD") {
        await commitStock(order.id, tx);
        await tx.order.update({
          where: { id: order.id },
          data: { fulfillmentStatus: "CONFIRMED" },
        });
        await recordOrderEvent(
          {
            orderId: order.id,
            dimension: "FULFILLMENT",
            from: "PENDING",
            to: "CONFIRMED",
            actor: "SYSTEM",
            note: "پرداخت هنگام تحویل — تایید خودکار",
          },
          tx,
        );
      }
    });

    await recordOrderEvent({
      orderId: order.id,
      dimension: "FULFILLMENT",
      from: "-",
      to: "PENDING",
      actor: "SYSTEM",
      note: "سفارش ثبت شد",
    });

    // transactional SMS: orderplaced (016)
    const sms = kavenegarConfigFromEnv();
    if (sms) {
      try {
        await sendLookup(sms, {
          phone: me.customer.phone,
          template: "orderplaced",
          tokens: [order.orderNumber, String(Math.round(totals.total))],
        });
      } catch { /* non-blocking */ }
    }

    return NextResponse.json({
      ok: true,
      order: { id: order.id, orderNumber, total: order.total, paymentMethod },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

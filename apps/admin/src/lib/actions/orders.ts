"use server";

import { redirect } from "next/navigation";
import { db, $Enums } from "@kmodern/db";
import { actionContext } from "./ctx";
import { field, intField, jsonParse } from "./form-helpers";
import { recordAudit } from "@/lib/audit";
import { nextOrderNumber } from "@/lib/order-number";
import { commitStock, recordOrderEvent, releaseStock, reserveStock, restock } from "@/lib/inventory";
import type { ActionState } from "./auth";

const FULFILLMENT_NEXT: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  CANCELLED: [],
  RETURNED: [],
};

const PAYMENT_NEXT: Record<string, string[]> = {
  AWAITING: ["PAID", "FAILED"],
  PAID: ["REFUNDED"],
  FAILED: ["AWAITING"],
  REFUNDED: [],
};

/** generic order status transition — validates, writes OrderStatusEvent +
 * stock side effects (commit/release/restock) + audit (009/010) */
export async function setOrderStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, ip, ua } = await actionContext();
  const orderId = field(formData, "orderId");
  const dimension = field(formData, "dimension") as $Enums.OrderEventDimension;
  const to = field(formData, "to") as string;
  const note = field(formData, "note") || undefined;

  const order = await db().order.findUnique({ where: { id: orderId } });
  if (!order) return { error: "سفارش پیدا نشد" };

  const from = dimension === "FULFILLMENT" ? order.fulfillmentStatus : order.paymentStatus;
  const allowed = dimension === "FULFILLMENT" ? FULFILLMENT_NEXT[from] : PAYMENT_NEXT[from];
  if (!allowed?.includes(to)) {
    return { error: `انتقال از ${from} به ${to} مجاز نیست` };
  }

  // stock side effects
  if (dimension === "PAYMENT") {
    if (to === "PAID") await commitStock(orderId);
    else if (to === "FAILED") await releaseStock(orderId);
    else if (to === "REFUNDED") await restock(orderId);
  } else if (dimension === "FULFILLMENT") {
    if (to === "CANCELLED" || to === "RETURNED") {
      if (order.paymentStatus === "PAID") await restock(orderId);
      else await releaseStock(orderId);
    }
  }

  const data =
    dimension === "FULFILLMENT"
      ? { fulfillmentStatus: to as $Enums.FulfillmentStatus }
      : { paymentStatus: to as $Enums.PaymentStatus };

  await db().$transaction([
    db().order.update({ where: { id: orderId }, data }),
    db().orderStatusEvent.create({
      data: {
        orderId,
        dimension,
        from,
        to,
        actor: admin.email,
        note,
      },
    }),
  ]);

  await recordAudit({
    adminUserId: admin.id,
    action: `ORDER_${to}`,
    entityType: "ORDER",
    entityId: orderId,
    meta: { dimension, from, to, note, orderNumber: order.orderNumber, ip, ua },
  });

  return { ok: true, message: "وضعیت سفارش به‌روزرسانی شد" };
}

interface ManualItemInput {
  variantId: string;
  qty: number;
}

export async function createManualOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, ip, ua } = await actionContext();
  const customerId = field(formData, "customerId");
  const paymentMethod = field(formData, "paymentMethod") as $Enums.PaymentMethod;
  const shippingMethod = field(formData, "shippingMethod") as $Enums.ShippingMethod;
  const deliveryFeeMode = field(formData, "deliveryFeeMode") as $Enums.DeliveryFeeMode;
  const deliveryFee = Number(formData.get("deliveryFee")) || 0;
  const adminNote = field(formData, "adminNote") || null;
  const items = jsonParse<ManualItemInput[]>(formData.get("items") as string | null, []);
  const address = jsonParse<Record<string, unknown>>(formData.get("address") as string | null, {});

  if (!customerId) return { error: "مشتری را انتخاب کنید" };
  if (!items.length) return { error: "حداقل یک آیتم اضافه کنید" };
  if (items.some((i) => !i.variantId || !Number.isFinite(i.qty) || i.qty <= 0)) {
    return { error: "آیتم‌های نامعتبر" };
  }
  if (!["ONLINE", "CARD_TO_CARD", "COD"].includes(paymentMethod)) return { error: "روش پرداخت نامعتبر است" };
  if (!["LOCAL", "POST", "BARBERI"].includes(shippingMethod)) return { error: "روش ارسال نامعتبر است" };

  const variantIds = [...new Set(items.map((i) => i.variantId))];
  const variants = await db().variant.findMany({
    where: { id: { in: variantIds } },
    include: { product: { select: { id: true, name: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  for (const it of items) {
    if (!byId.has(it.variantId)) return { error: "یکی از تنوع‌ها پیدا نشد" };
  }

  const subtotal = items.reduce((s, it) => s + (byId.get(it.variantId)?.price ?? 0) * it.qty, 0);
  const total = subtotal - 0 + deliveryFee;
  const orderNumber = await nextOrderNumber();
  const cod = paymentMethod === "COD";
  const paidAtPlace = cod; // 011: COD commits at place

  const order = await db().$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber,
        customerId,
        shippingAddress: (Object.keys(address).length ? address : { recipientName: "", recipientPhone: "", province: "", city: "", addressLine: "", postalCode: "" }) as never,
        fulfillmentStatus: "PENDING",
        paymentStatus: paidAtPlace ? "PAID" : "AWAITING",
        paymentMethod,
        shippingMethod,
        deliveryFeeMode,
        subtotal,
        discountAmount: 0,
        deliveryFee,
        total,
        currency: "TOMAN",
        adminNote,
        placedAt: new Date(),
        items: {
          create: items.map((it) => {
            const v = byId.get(it.variantId)!;
            return {
              productId: v.productId,
              variantId: v.id,
              productName: v.product.name,
              colorName: v.colorName,
              sku: v.sku,
              unitPrice: v.price,
              quantity: it.qty,
              lineTotal: v.price * it.qty,
              image: v.images[0] ?? null,
            };
          }),
        },
        events: {
          create: [
            { dimension: "FULFILLMENT", from: "", to: "PENDING", actor: admin.email, note: "سفارش دستی" },
            ...(paidAtPlace
              ? [{ dimension: "PAYMENT" as const, from: "AWAITING", to: "PAID", actor: admin.email, note: "پرداخت هنگام ثبت (COD)" }]
              : []),
          ],
        },
      },
      include: { items: true },
    });
    return created;
  });

  // stock: reserve for online/c2c; COD commits at place (store parity)
  const lines = items.map((it) => ({ variantId: it.variantId, qty: it.qty }));
  if (paidAtPlace) await commitStock(order.id);
  else await reserveStock(order.id, lines, paymentMethod);

  await recordAudit({
    adminUserId: admin.id,
    action: "ORDER_CREATED_MANUAL",
    entityType: "ORDER",
    entityId: order.id,
    meta: { orderNumber, subtotal, total, paymentMethod, ip, ua },
  });

  redirect(`/orders/${order.id}`);
}

/** manual stock adjustment with delta + note + audit (017 inventory queue) */
export async function adjustStock(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, ip, ua } = await actionContext();
  const variantId = field(formData, "variantId");
  const delta = intField(formData, "delta");
  const note = field(formData, "note") || "تعدیل دستی";

  if (!variantId || delta === 0) return { error: "مقدار تغییر باید غیرصفر باشد" };
  const variant = await db().variant.findUnique({ where: { id: variantId } });
  if (!variant) return { error: "تنوع پیدا نشد" };
  if (variant.stock + delta < 0) return { error: "موجودی نمی‌تواند منفی شود" };

  await db().variant.update({
    where: { id: variantId },
    data: { stock: { increment: delta } },
  });
  await recordAudit({
    adminUserId: admin.id,
    action: "STOCK_ADJUSTED",
    entityType: "VARIANT",
    entityId: variantId,
    meta: { delta, note, before: variant.stock, after: variant.stock + delta, sku: variant.sku, ip, ua },
  });
  return { ok: true, message: "موجودی تعدیل شد" };
}

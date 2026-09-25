"use server";

import { redirect } from "next/navigation";
import { db, $Enums } from "@kmodern/db";
import { addressSchema } from "@kmodern/schema";
import { settingKeys } from "@kmodern/schema/setting-keys";
import { actionContext } from "./ctx";
import { field, intField, jsonParse } from "./form-helpers";
import { getSettingOrDefault } from "@/lib/settings";
import { nextOrderNumber } from "@/lib/order-number";
import { commitStock, releaseStock, reserveStock, restock } from "@/lib/inventory";
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

/** generic order status transition — validates, writes status, stock side
 * effects, event, and audit as one transaction. */
export async function setOrderStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, ip, ua } = await actionContext();
  const orderId = field(formData, "orderId");
  const dimension = field(formData, "dimension") as $Enums.OrderEventDimension;
  const to = field(formData, "to") as string;
  const note = field(formData, "note") || undefined;

  if (!orderId || !["FULFILLMENT", "PAYMENT"].includes(dimension) || !to || (note?.length ?? 0) > 1000) {
    return { error: "درخواست تغییر وضعیت نامعتبر است" };
  }

  try {
    await db().$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new Error("ORDER_NOT_FOUND");
      const from = dimension === "FULFILLMENT" ? order.fulfillmentStatus : order.paymentStatus;
      const allowed = dimension === "FULFILLMENT" ? FULFILLMENT_NEXT[from] : PAYMENT_NEXT[from];
      if (!allowed?.includes(to)) throw new Error(`INVALID_TRANSITION:${from}:${to}`);

      const statusField = dimension === "FULFILLMENT" ? "fulfillmentStatus" : "paymentStatus";
      const updated = await tx.order.updateMany({
        where: { id: orderId, [statusField]: from } as never,
        data: { [statusField]: to } as never,
      });
      if (updated.count !== 1) throw new Error("ORDER_CHANGED");

      // Side effects run only after the compare-and-set above. A concurrent
      // duplicate request cannot apply the same transition twice.
      if (dimension === "PAYMENT") {
        if (to === "PAID") await commitStock(orderId, tx);
        else if (to === "FAILED") await releaseStock(orderId, tx);
        else if (to === "REFUNDED") await restock(orderId, tx);
      } else if (to === "CANCELLED" || to === "RETURNED") {
        if (order.paymentStatus === "PAID") await restock(orderId, tx);
        else await releaseStock(orderId, tx);
      }

      await tx.orderStatusEvent.create({
        data: { orderId, dimension, from, to, actor: admin.email, note },
      });
      await tx.adminAuditLog.create({
        data: {
          adminUserId: admin.id,
          action: `ORDER_${to}`,
          entityType: "ORDER",
          entityId: orderId,
          meta: { dimension, from, to, note, orderNumber: order.orderNumber, ip, ua },
        },
      });
    }, { timeout: 15_000 });
    return { ok: true, message: "وضعیت سفارش به‌روزرسانی شد" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ORDER_NOT_FOUND") return { error: "سفارش پیدا نشد" };
    if (message === "ORDER_CHANGED") return { error: "وضعیت سفارش هم‌زمان تغییر کرده؛ صفحه را تازه‌سازی کنید" };
    if (message.startsWith("INVALID_TRANSITION")) return { error: "این انتقال وضعیت مجاز نیست" };
    if (message.startsWith("INSUFFICIENT_STOCK")) return { error: "موجودی برای این انتقال کافی نیست" };
    return { error: "تغییر وضعیت انجام نشد؛ دوباره تلاش کنید" };
  }
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
  const rawDeliveryFee = Number(formData.get("deliveryFee") ?? 0);
  const adminNote = field(formData, "adminNote") || null;
  const items = jsonParse<ManualItemInput[]>(formData.get("items") as string | null, []);
  // the manual-order form posts dot-named address fields (no hidden JSON blob)
  const address = {
    recipientName: field(formData, "address.recipientName"),
    recipientPhone: field(formData, "address.recipientPhone"),
    province: field(formData, "address.province"),
    city: field(formData, "address.city"),
    addressLine: field(formData, "address.addressLine"),
    postalCode: field(formData, "address.postalCode"),
  };
  const addressParsed = addressSchema.safeParse({ ...address, isDefault: false });
  if (!addressParsed.success) {
    return { error: addressParsed.error.issues[0]?.message ?? "آدرس گیرنده معتبر نیست" };
  }
  const shippingAddress = addressParsed.data;
  const deliveryFee = deliveryFeeMode === "FREE" ? 0 : rawDeliveryFee;

  if (!customerId) return { error: "مشتری را انتخاب کنید" };
  if (adminNote && adminNote.length > 2000) return { error: "یادداشت ادمین بیش از حد طولانی است" };
  if (!address.recipientName || !address.recipientPhone) return { error: "نام و موبایل گیرنده الزامی است" };
  if (address.recipientName.length > 200 || address.recipientPhone.length > 40) return { error: "اطلاعات گیرنده بیش از حد طولانی است" };
  if (!Array.isArray(items) || !items.length) return { error: "حداقل یک آیتم اضافه کنید" };
  if (items.length > 100 || items.some((i) => !i || typeof i.variantId !== "string" || !Number.isInteger(i.qty) || i.qty <= 0 || i.qty > 1000)) {
    return { error: "آیتم‌های نامعتبر" };
  }
  if (new Set(items.map((i) => i.variantId)).size !== items.length) return { error: "هر تنوع فقط یک بار در سفارش باشد" };
  if (!Number.isFinite(deliveryFee) || deliveryFee < 0) return { error: "هزینه ارسال نامعتبر است" };
  if (!["ONLINE", "CARD_TO_CARD", "COD"].includes(paymentMethod)) return { error: "روش پرداخت نامعتبر است" };
  if (!["LOCAL", "POST", "BARBERI"].includes(shippingMethod)) return { error: "روش ارسال نامعتبر است" };
  if (!["FREE", "FLAT", "API_QUOTE", "FALLBACK_FLAT", "FREIGHT_COLLECT"].includes(deliveryFeeMode)) return { error: "روش محاسبه ارسال نامعتبر است" };

  const variantIds = items.map((i) => i.variantId);
  const cod = paymentMethod === "COD";
  const reserveMins = await getSettingOrDefault<number>(settingKeys.checkoutOnlineReserveMinutes, 30);
  const c2cHours = await getSettingOrDefault<number>(settingKeys.checkoutC2cReserveHours, 48);
  const reservationExpiry = new Date(Date.now() + (paymentMethod === "ONLINE"
    ? reserveMins * 60_000
    : c2cHours * 3_600_000));

  let createdOrderId: string;
  try {
    const orderNumber = await nextOrderNumber();
    const order = await db().$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } });
      if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
      const variants = await tx.variant.findMany({
        where: { id: { in: variantIds } },
        include: { product: { select: { id: true, name: true } } },
      });
      const byId = new Map(variants.map((v) => [v.id, v]));
      if (byId.size !== variantIds.length) throw new Error("VARIANT_NOT_FOUND");
      const lines = items.map((it) => {
        const variant = byId.get(it.variantId)!;
        if (!Number.isFinite(variant.price) || variant.price < 0) throw new Error("INVALID_PRICE");
        return { ...it, variant };
      });
      const subtotal = lines.reduce((sum, line) => sum + line.variant.price * line.qty, 0);
      const total = subtotal + deliveryFee;
      const created = await tx.order.create({
        data: {
          orderNumber,
          customerId,
          shippingAddress: shippingAddress as never,
          fulfillmentStatus: "PENDING",
          paymentStatus: cod ? "PAID" : "AWAITING",
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
            create: lines.map(({ variant, qty }) => ({
              productId: variant.productId,
              variantId: variant.id,
              productName: variant.product.name,
              colorName: variant.colorName,
              sku: variant.sku,
              unitPrice: variant.price,
              quantity: qty,
              lineTotal: variant.price * qty,
              image: variant.images[0] ?? null,
            })),
          },
          events: {
            create: [
              { dimension: "FULFILLMENT", from: "", to: "PENDING", actor: admin.email, note: "سفارش دستی" },
              ...(cod
                ? [{ dimension: "PAYMENT" as const, from: "AWAITING", to: "PAID", actor: admin.email, note: "پرداخت هنگام ثبت (COD)" }]
                : []),
            ],
          },
        },
        include: { items: true },
      });
      const stockLines = lines.map(({ variant, qty }) => ({ variantId: variant.id, qty, allowBackorder: variant.allowBackorder }));
      await reserveStock(created.id, stockLines, paymentMethod, tx, reservationExpiry);
      if (cod) await commitStock(created.id, tx);
      await tx.adminAuditLog.create({
        data: {
          adminUserId: admin.id,
          action: "ORDER_CREATED_MANUAL",
          entityType: "ORDER",
          entityId: created.id,
          meta: { orderNumber, subtotal, total, paymentMethod, ip, ua },
        },
      });
      return created;
    }, { timeout: 15_000 });
    createdOrderId = order.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "CUSTOMER_NOT_FOUND") return { error: "مشتری پیدا نشد" };
    if (message === "VARIANT_NOT_FOUND") return { error: "یکی از تنوع‌ها پیدا نشد" };
    if (message.startsWith("INSUFFICIENT_STOCK")) return { error: "موجودی برای یکی از تنوع‌ها کافی نیست" };
    if (message === "INVALID_PRICE") return { error: "قیمت تنوع نامعتبر است" };
    return { error: "ثبت سفارش انجام نشد؛ دوباره تلاش کنید" };
  }
  redirect(`/orders/${createdOrderId}`);
}

/** manual stock adjustment with compare-and-set + audit (017 inventory queue) */
export async function adjustStock(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, ip, ua } = await actionContext();
  const variantId = field(formData, "variantId");
  const delta = intField(formData, "delta");
  const note = field(formData, "note") || "تعدیل دستی";

  if (!variantId || delta === 0 || Math.abs(delta) > 1_000_000 || note.length > 500) {
    return { error: "مقدار تغییر یا توضیح نامعتبر است" };
  }

  try {
    await db().$transaction(async (tx) => {
      const variant = await tx.variant.findUnique({ where: { id: variantId } });
      if (!variant) throw new Error("VARIANT_NOT_FOUND");
      if (variant.stock + delta < variant.reserved) throw new Error("STOCK_RESERVED");
      const updated = await tx.variant.updateMany({
        where: {
          id: variantId,
          stock: variant.stock,
          reserved: variant.reserved,
        },
        data: { stock: { increment: delta } },
      });
      if (updated.count !== 1) throw new Error("STOCK_CONFLICT");
      await tx.adminAuditLog.create({
        data: {
          adminUserId: admin.id,
          action: "STOCK_ADJUSTED",
          entityType: "VARIANT",
          entityId: variantId,
          meta: { delta, note, before: variant.stock, after: variant.stock + delta, sku: variant.sku, ip, ua },
        },
      });
    });
    return { ok: true, message: "موجودی تعدیل شد" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "VARIANT_NOT_FOUND") return { error: "تنوع پیدا نشد" };
    if (message === "STOCK_RESERVED") return { error: "موجودی قابل تزریق کمتر از مقدار رزروشده است" };
    if (message === "STOCK_CONFLICT") return { error: "موجودی هم‌زمان تغییر کرده؛ دوباره تلاش کنید" };
    return { error: "تعدیل موجودی انجام نشد" };
  }
}

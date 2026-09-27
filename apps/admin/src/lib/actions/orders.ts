"use server";

import { redirect } from "next/navigation";
import { commitStock, db, reserveStock, $Enums } from "@kmodern/db";
import { addressSchema } from "@kmodern/schema";
import { settingKeys } from "@kmodern/schema/setting-keys";
import { actionContext } from "./ctx";
import { field, intField, jsonParse } from "./form-helpers";
import { getSettingOrDefault } from "@/lib/settings";
import { nextOrderNumber } from "@/lib/order-number";
import { setOrderStatus } from "./order-status";
import { fromGateway } from "@/lib/gateway";
import { failed, type ActionResult } from "./result";

/**
 * Order status change, through the gateway.
 *
 * A form-fields-to-request adapter and nothing more. The transition tables, the compare-and-set, the
 * stock side effect, the event and the audit line all belong to the gateway, which has enforced them
 * since ticket 08 — the panel's copies of that logic were a second implementation free to disagree,
 * and one of them had already: the panel released stock on a cancellation unconditionally where the
 * gateway restocks a paid order. The `actionContext()` call remains so an unauthenticated POST to this
 * action is refused at the panel's own boundary before the gateway is asked on the operator's behalf.
 */
export async function setOrderStatusAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await actionContext();
  return setOrderStatus({
    orderId: field(formData, "orderId"),
    dimension: field(formData, "dimension") as "FULFILLMENT" | "PAYMENT",
    to: field(formData, "to"),
    note: field(formData, "note") || undefined,
  });
}

interface ManualItemInput {
  variantId: string;
  qty: number;
}

export async function createManualOrder(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
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
    return failed(addressParsed.error.issues[0]?.message ?? "آدرس گیرنده معتبر نیست");
  }
  const shippingAddress = addressParsed.data;
  const deliveryFee = deliveryFeeMode === "FREE" ? 0 : rawDeliveryFee;

  if (!customerId) return failed("مشتری را انتخاب کنید");
  if (adminNote && adminNote.length > 2000) return failed("یادداشت ادمین بیش از حد طولانی است");
  if (!address.recipientName || !address.recipientPhone) return failed("نام و موبایل گیرنده الزامی است");
  if (address.recipientName.length > 200 || address.recipientPhone.length > 40) return failed("اطلاعات گیرنده بیش از حد طولانی است");
  if (!Array.isArray(items) || !items.length) return failed("حداقل یک آیتم اضافه کنید");
  if (items.length > 100 || items.some((i) => !i || typeof i.variantId !== "string" || !Number.isInteger(i.qty) || i.qty <= 0 || i.qty > 1000)) {
    return failed("آیتم‌های نامعتبر");
  }
  if (new Set(items.map((i) => i.variantId)).size !== items.length) return failed("هر تنوع فقط یک بار در سفارش باشد");
  if (!Number.isFinite(deliveryFee) || deliveryFee < 0) return failed("هزینه ارسال نامعتبر است");
  if (!["ONLINE", "CARD_TO_CARD", "COD"].includes(paymentMethod)) return failed("روش پرداخت نامعتبر است");
  if (!["LOCAL", "POST", "BARBERI"].includes(shippingMethod)) return failed("روش ارسال نامعتبر است");
  if (!["FREE", "FLAT", "API_QUOTE", "FALLBACK_FLAT", "FREIGHT_COLLECT"].includes(deliveryFeeMode)) return failed("روش محاسبه ارسال نامعتبر است");

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
      await reserveStock(created.id, stockLines, paymentMethod, { expiresAt: reservationExpiry }, tx);
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
    if (message === "CUSTOMER_NOT_FOUND") return failed("مشتری پیدا نشد");
    if (message === "VARIANT_NOT_FOUND") return failed("یکی از تنوع‌ها پیدا نشد");
    if (message.startsWith("INSUFFICIENT_STOCK")) return failed("موجودی برای یکی از تنوع‌ها کافی نیست");
    if (message === "INVALID_PRICE") return failed("قیمت تنوع نامعتبر است");
    return failed("ثبت سفارش انجام نشد؛ دوباره تلاش کنید");
  }
  redirect(`/orders/${createdOrderId}`);
}

/**
 * Manual stock adjustment, through the gateway (017 inventory queue).
 *
 * The compare-and-set, the reserved-stock floor and the audit line are the gateway's — `inventory`
 * has owned the stock lifecycle since ticket 08, and the panel's copy here was a fourth implementation
 * of it. The `note` is sent rather than recorded locally because it is the only part of this action
 * that is the panel's business: what the operator said about the adjustment.
 */
export async function adjustStock(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await actionContext();
  const variantId = field(formData, "variantId");
  const delta = intField(formData, "delta");
  const note = field(formData, "note") || "تعدیل دستی";

  if (!variantId || delta === 0 || Math.abs(delta) > 1_000_000 || note.length > 500) {
    return failed("مقدار تغییر یا توضیح نامعتبر است");
  }

  return fromGateway(
    (client) =>
      client.post(`/inventory/variants/${encodeURIComponent(variantId)}/adjust`, { delta, note }),
    "موجودی تعدیل شد",
  );
}

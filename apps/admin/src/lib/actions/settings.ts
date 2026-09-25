"use server";

import { db } from "@kmodern/db";
import { discountSchema } from "@kmodern/schema";
import { settingKeys } from "@kmodern/schema/setting-keys";
import { actionContext } from "./ctx";
import { field, jsonParse } from "./form-helpers";
import { recordAudit } from "@/lib/audit";
import { setSetting } from "@/lib/settings";
import { fromDateTimeLocal } from "@/lib/date";
import type { ActionState } from "./auth";

// ---------------------------------------------------------------
// Settings (011/017) — typed per-section writes
// ---------------------------------------------------------------

const SECTIONS = {
  store: {
    label: "فروشگاه",
    fields: {
      storeName: "string",
      storeLogo: "string",
      storeTagline: "string",
      storeContact: "string",
      blogDefaultByline: "string",
      seoDefaultTitle: "string",
      seoDefaultDescription: "string",
    },
  },
  shipping: {
    label: "ارسال",
    fields: {
      shippingLocalFeeMode: "enum",
      shippingLocalFlatFee: "number",
      shippingPostWeightCap: "number",
      shippingPostFallbackFee: "number",
      shippingMaxCodTotal: "number",
      shippingBarberiNote: "string",
    },
  },
  payments: {
    label: "پرداخت",
    fields: {
      paymentC2cCardNumber: "string",
      paymentC2cCardHolder: "string",
      paymentC2cBankName: "string",
    },
  },
  inventory: {
    label: "انبار",
    fields: {
      inventoryLowStockThreshold: "number",
      checkoutOnlineReserveMinutes: "number",
      checkoutC2cReserveHours: "number",
    },
  },
  notifications: {
    label: "اعلان‌ها",
    fields: {
      adminAlertMobile: "string",
    },
  },
} as const;

const ENUM_VALUES: Record<string, string[]> = {
  shippingLocalFeeMode: ["FREE", "FLAT", "API_QUOTE", "FALLBACK_FLAT", "FREIGHT_COLLECT"],
};

export async function saveSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, ip, ua } = await actionContext();
  const section = field(formData, "section") as keyof typeof SECTIONS;
  const def = Object.prototype.hasOwnProperty.call(SECTIONS, section) ? SECTIONS[section] : undefined;
  if (!def) return { error: "بخش نامعتبر است" };

  const changes: Array<{ key: string; value: unknown }> = [];
  for (const [key, type] of Object.entries(def.fields)) {
    const raw = formData.get(key);
    if (raw === null) continue;
    const s = String(raw).trim();
    if (type === "number") {
      if (s === "") continue;
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0) return { error: `مقدار «${key}» باید عدد غیرمنفی باشد` };
      if (["inventoryLowStockThreshold", "checkoutOnlineReserveMinutes", "checkoutC2cReserveHours"].includes(key) && !Number.isInteger(n)) {
        return { error: `مقدار «${key}» باید عدد صحیح باشد` };
      }
      if (["checkoutOnlineReserveMinutes", "checkoutC2cReserveHours"].includes(key) && n < 1) {
        return { error: `مقدار «${key}» باید بزرگ‌تر از صفر باشد` };
      }
      changes.push({ key, value: n });
    } else if (type === "enum") {
      if (!ENUM_VALUES[key]?.includes(s)) return { error: `مقدار نامعتبر برای «${key}»` };
      changes.push({ key, value: s });
    } else {
      if (s.length > 1000) return { error: `مقدار «${key}» بیش از حد طولانی است` };
      if (key === "adminAlertMobile" && s && !/^09\d{9}$/.test(s)) return { error: "شماره هشدار معتبر نیست" };
      changes.push({ key, value: s });
    }
  }

  for (const c of changes) {
    const key = (settingKeys as Record<string, string>)[c.key];
    if (!key) return { error: `کلید ناشناخته: ${c.key}` };
    await setSetting(key as never, c.value);
  }

  await recordAudit({
    adminUserId: admin.id,
    action: "SETTINGS_UPDATED",
    entityType: "SETTINGS",
    entityId: section,
    meta: { keys: changes.map((c) => c.key), ip, ua },
  });
  return { ok: true, message: "تنظیمات ذخیره شد" };
}

// ---------------------------------------------------------------
// Discounts (018) — CRUD per discountSchema
// ---------------------------------------------------------------

export async function saveDiscount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { admin, ip, ua } = await actionContext();
  const id = field(formData, "id");
  const payload = jsonParse<Record<string, unknown>>(formData.get("payload") as string | null, {});
  const normalizeDate = (value: unknown): unknown => {
    if (typeof value !== "string" || !value || /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return value;
    const parsed = fromDateTimeLocal(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  };
  const normalizedPayload = {
    ...payload,
    startsAt: normalizeDate(payload.startsAt),
    ...(payload.endsAt ? { endsAt: normalizeDate(payload.endsAt) } : {}),
  };

  const parsed = discountSchema.safeParse(normalizedPayload);
  if (!parsed.success) {
    return { error: `فرم تخفیف نامعتبر است: ${parsed.error.issues[0]?.message ?? ""}` };
  }
  const d = parsed.data;
  if (d.mode === "COUPON" && !d.code) return { error: "برای حالت کوپن، کد الزامی است" };
  const scopeIds = d.scope === "PRODUCTS" ? d.productIds : d.scope === "CATEGORIES" ? d.categoryIds : d.scope === "COLLECTIONS" ? d.collectionIds : [];
  if (new Set(scopeIds).size !== scopeIds.length) return { error: "شناسه‌های دامنه تکراری هستند" };
  if (scopeIds.length) {
    const count = d.scope === "PRODUCTS"
      ? await db().product.count({ where: { id: { in: scopeIds } } })
      : d.scope === "CATEGORIES"
        ? await db().category.count({ where: { id: { in: scopeIds } } })
        : await db().collection.count({ where: { id: { in: scopeIds } } });
    if (count !== scopeIds.length) return { error: "یکی از مقصدهای تخفیف پیدا نشد" };
  }

  const data = {
    type: d.type,
    scope: d.scope,
    mode: d.mode,
    code: d.mode === "COUPON" ? d.code ?? null : null,
    value: d.value,
    maxAmount: d.maxAmount ?? null,
    productIds: d.productIds,
    categoryIds: d.categoryIds,
    collectionIds: d.collectionIds,
    startsAt: new Date(d.startsAt),
    endsAt: d.endsAt ? new Date(d.endsAt) : null,
    minOrderSubtotal: d.minOrderSubtotal ?? null,
    maxUsesTotal: d.maxUsesTotal ?? null,
    maxUsesPerCustomer: d.maxUsesPerCustomer ?? null,
    status: d.status,
  };

  try {
    const discount = id
      ? await db().discount.update({ where: { id }, data })
      : await db().discount.create({ data });
    await recordAudit({
      adminUserId: admin.id,
      action: id ? "DISCOUNT_UPDATED" : "DISCOUNT_CREATED",
      entityType: "DISCOUNT",
      entityId: discount.id,
      meta: { type: d.type, scope: d.scope, mode: d.mode, code: d.code, ip, ua },
    });
    return { ok: true, message: "تخفیف ذخیره شد" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطای ناشناخته";
    if (msg.includes("code") && msg.includes("Unique")) return { error: "این کد قبلاً استفاده شده است" };
    return { error: "ذخیره انجام نشد؛ دوباره تلاش کنید" };
  }
}

export async function deleteDiscount(formData: FormData) {
  const { admin, ip, ua } = await actionContext();
  const id = field(formData, "id");
  await db().discount.delete({ where: { id } });
  await recordAudit({
    adminUserId: admin.id,
    action: "DISCOUNT_DELETED",
    entityType: "DISCOUNT",
    entityId: id,
    meta: { ip, ua },
  });
  return { ok: true };
}

export async function deleteDiscountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return deleteDiscount(formData);
}
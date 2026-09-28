"use server";

import { db } from "@kmodern/db";
import { settingKeys } from "@kmodern/schema/setting-keys";
import { actionContext } from "./ctx";
import { field } from "./form-helpers";
import { recordAudit } from "@/lib/audit";
import { setSetting } from "@/lib/settings";
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


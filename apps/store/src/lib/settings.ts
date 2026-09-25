import { db } from "@kmodern/db";
import { settingKeys, type SettingKey } from "@kmodern/schema/setting-keys";

// Typed settings accessor (011/017). Values stored as JSON in Setting.
const CAST: Partial<Record<SettingKey, "number" | "boolean" | "string">> = {
  [settingKeys.shippingLocalFlatFee]: "number",
  [settingKeys.shippingPostWeightCap]: "number",
  [settingKeys.shippingPostFallbackFee]: "number",
  [settingKeys.shippingMaxCodTotal]: "number",
  [settingKeys.inventoryLowStockThreshold]: "number",
  [settingKeys.checkoutOnlineReserveMinutes]: "number",
  [settingKeys.checkoutC2cReserveHours]: "number",
  [settingKeys.smsProviderConfigured]: "boolean",
};

export async function getSetting<T = unknown>(key: SettingKey): Promise<T | null> {
  const row = await db().setting.findUnique({ where: { key } });
  if (!row) return null;
  let v = row.value as T;
  const cast = CAST[key];
  if (cast === "number" && typeof v !== "number") v = Number(v) as T;
  if (cast === "boolean" && typeof v !== "boolean") v = Boolean(v) as T;
  return v;
}

export async function getSettingOrDefault<T>(key: SettingKey, fallback: T): Promise<T> {
  const v = await getSetting<T>(key);
  return v === null || v === undefined ? fallback : v;
}

export async function setSetting(key: SettingKey, value: unknown, description?: string) {
  return db().setting.upsert({
    where: { key },
    update: { value: value as never },
    create: { key, value: value as never, description },
  });
}
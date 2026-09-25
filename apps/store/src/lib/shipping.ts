import { db } from "@kmodern/db";
import { isKermanCity } from "@kmodern/schema";
import { settingKeys } from "@kmodern/schema/setting-keys";
import { getSettingOrDefault } from "./settings";
import { postexConfigFromEnv, fetchQuotes } from "@kmodern/adapters";

// 011 shipping auto-assignment. Customer never picks a method; it is derived
// from destination + cart weight, then shown. Admin may override ops-only later.

export interface CartLine {
  variantId: string;
  qty: number;
  weightKg: number; // category.weightKg
  price: number;
  productName: string;
}

export interface ShippingQuote {
  method: "LOCAL" | "POST" | "BARBERI";
  deliveryFee: number; // TOMAN frozen into order
  deliveryFeeMode: DeliveryFeeMode;
  note?: string; // e.g. باربری پس‌کرایه / pay on arrival / free shipping
  quotes?: Array<{ carrier: string; priceToman: number; estimatedDays?: number }>;
}

type DeliveryFeeMode = "FREE" | "FLAT" | "API_QUOTE" | "FALLBACK_FLAT" | "FREIGHT_COLLECT";

export async function assignShippingMethod(
  province: string,
  city: string,
  lines: CartLine[],
): Promise<ShippingQuote> {
  const totalWeight = lines.reduce((s, l) => s + l.weightKg * l.qty, 0);
  const local = isKermanCity(province, city);

  if (local) {
    // LOCAL fee mode from settings
    const mode = await getSettingOrDefault<string>(settingKeys.shippingLocalFeeMode, "FLAT");
    if (mode === "FREE") return { method: "LOCAL", deliveryFee: 0, deliveryFeeMode: "FREE", note: "ارسال رایگان" };
    if (mode === "FREIGHT_COLLECT") return { method: "LOCAL", deliveryFee: 0, deliveryFeeMode: "FREIGHT_COLLECT", note: "هزینه ارسال هنگام تحویل" };
    const flat = await getSettingOrDefault<number>(settingKeys.shippingLocalFlatFee, 200000);
    return { method: "LOCAL", deliveryFee: flat, deliveryFeeMode: "FLAT" };
  }

  // non-Kerman: POST if weight ≤ cap, else BARBERI
  const cap = await getSettingOrDefault<number>(settingKeys.shippingPostWeightCap, 0);
  if (cap > 0 && totalWeight <= cap) {
    const cfg = postexConfigFromEnv();
    if (cfg) {
      try {
        const quotes = await fetchQuotes(cfg, { city, weightKg: totalWeight });
        if (quotes.length > 0) {
          const best = quotes.reduce((a, b) => (b.priceToman < a.priceToman ? b : a));
          return {
            method: "POST",
            deliveryFee: best.priceToman,
            deliveryFeeMode: "API_QUOTE",
            quotes,
          };
        }
      } catch {
        // fall through to fallback
      }
    }
    const fallback = await getSettingOrDefault<number>(settingKeys.shippingPostFallbackFee, 0);
    if (fallback > 0) {
      return { method: "POST", deliveryFee: fallback, deliveryFeeMode: "FALLBACK_FLAT", note: "هزینه تقریبی" };
    }
    // post unavailable (fallback 0)
    return { method: "BARBERI", deliveryFee: 0, deliveryFeeMode: "FREIGHT_COLLECT", note: "پس‌کرایه" };
  }

  // BARBERI — offline freight, always freight-collect at storefront (011)
  const note = await getSettingOrDefault<string>(settingKeys.shippingBarberiNote, "پس‌کرایه");
  return { method: "BARBERI", deliveryFee: 0, deliveryFeeMode: "FREIGHT_COLLECT", note };
}
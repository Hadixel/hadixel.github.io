// How a delivery is priced, in the gateway.
//
// A shopper never picks a shipping method. It is derived from the destination and the cart's weight,
// and then shown — so the derivation is a rule, and a rule in a storefront module is a rule the panel's
// manual-order form cannot reach. The provider call goes through one adapter here; there is no second
// path that asks the carrier a different question for the same parcel.
//
// The fallback chain is deliberate and each step says what it is for: a live quote, then the merchant's
// configured approximation, then freight-collect. Silently returning zero would look like free
// delivery, which is a different promise.

import { fetchQuotes, postexConfigFromEnv } from "../shipping/postex.js";
import { isKermanCity } from "@kmodern/schema";
import { settingKeys } from "@kmodern/schema/setting-keys";
import type { CheckoutDb as Db } from "./db-types.js";

export interface ShippingLine {
  variantId: string;
  qty: number;
  /** The category's nominal weight, which is what the carrier is quoted. */
  weightKg: number;
}

export type DeliveryFeeMode = "FREE" | "FLAT" | "API_QUOTE" | "FALLBACK_FLAT" | "FREIGHT_COLLECT";
export type ShippingMethod = "LOCAL" | "POST" | "BARBERI";

export interface ShippingQuote {
  method: ShippingMethod;
  /** TOMAN, frozen into the order when it is created. */
  deliveryFee: number;
  deliveryFeeMode: DeliveryFeeMode;
  note?: string;
  quotes?: { carrier: string; priceToman: number; estimatedDays?: number }[];
}

/** A setting read with a default, where the default is the documented behaviour rather than a guess. */
async function setting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const row = await db.setting.findUnique({ where: { key } });
  if (!row || typeof row.value !== typeof fallback) return fallback;
  return row.value as T;
}

/**
 * Derive the shipping method and its cost.
 *
 * `db` is the transaction's client when there is one, so a quote read during checkout sees the same
 * settings the order row will be frozen against.
 */
export async function assignShippingMethod(
  db: Db,
  province: string,
  city: string,
  lines: ShippingLine[],
): Promise<ShippingQuote> {
  const totalWeight = lines.reduce((sum, line) => sum + line.weightKg * line.qty, 0);

  if (isKermanCity(province, city)) {
    const mode = await setting<string>(db, settingKeys.shippingLocalFeeMode, "FLAT");
    if (mode === "FREE") {
      return { method: "LOCAL", deliveryFee: 0, deliveryFeeMode: "FREE", note: "ارسال رایگان" };
    }
    if (mode === "FREIGHT_COLLECT") {
      return { method: "LOCAL", deliveryFee: 0, deliveryFeeMode: "FREIGHT_COLLECT", note: "هزینه ارسال هنگام تحویل" };
    }
    const flat = await setting<number>(db, settingKeys.shippingLocalFlatFee, 200_000);
    return { method: "LOCAL", deliveryFee: flat, deliveryFeeMode: "FLAT" };
  }

  // Out of the local area: the post is an option only while the parcel is under the weight cap.
  const cap = await setting<number>(db, settingKeys.shippingPostWeightCap, 0);
  if (cap > 0 && totalWeight <= cap) {
    const config = postexConfigFromEnv();
    if (config) {
      try {
        const quotes = await fetchQuotes(config, { city, weightKg: totalWeight });
        if (quotes.length > 0) {
          const best = quotes.reduce((a, b) => (b.priceToman < a.priceToman ? b : a));
          return { method: "POST", deliveryFee: best.priceToman, deliveryFeeMode: "API_QUOTE", quotes };
        }
      } catch {
        // A carrier that is down must not fail a checkout. Fall through to the configured
        // approximation, which is what the merchant set for exactly this case.
      }
    }
    const fallback = await setting<number>(db, settingKeys.shippingPostFallbackFee, 0);
    if (fallback > 0) {
      return { method: "POST", deliveryFee: fallback, deliveryFeeMode: "FALLBACK_FLAT", note: "هزینه تقریبی" };
    }
    return { method: "BARBERI", deliveryFee: 0, deliveryFeeMode: "FREIGHT_COLLECT", note: "پس‌کرایه" };
  }

  const note = await setting<string>(db, settingKeys.shippingBarberiNote, "پس‌کرایه");
  return { method: "BARBERI", deliveryFee: 0, deliveryFeeMode: "FREIGHT_COLLECT", note };
}

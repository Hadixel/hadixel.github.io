import { cache } from "react";
import { gateway } from "@/lib/gateway";
import { GatewayError } from "@kmodern/transport/client";
import { settingKeys, type SettingKey } from "@kmodern/contracts/setting-keys";

// Typed settings accessor for the storefront (011/017).
//
// This used to open the `Setting` table itself and carry a cast table to undo the JSON column — a
// number setting read raw is a string, and every caller had to know that. The cast table was also a
// silent second copy of the settings definitions the gateway already serves: a setting added to the
// shop was in the gateway's list and absent from this one, so the shop's own settings form could save
// a value the storefront then ignored.
//
// It now asks `GET /settings/public`, which is an allowlist rather than a filter. That distinction is
// the whole reason the route exists: the same table holds the shop's SMS-provider flag and its reserve
// windows, and a storefront read that answered with all of it would publish an operational map of the
// business to anyone who asked. The card-to-card details are in the list deliberately — a shopper
// paying by transfer is shown the number to transfer to.

/**
 * One read for every public setting, memoised for the length of one render.
 *
 * React's `cache` and not a module variable, and the reason is the failure mode: a module-level
 * promise lives as long as the server process, so a setting the operator changed would be read once
 * and served from memory for the rest of the deployment. The shipping quote, the store name and the
 * card number would all be stale until the next deploy. `cache` scopes the memo to the request.
 */
const readPublic = cache(async (): Promise<Record<string, string | number | boolean>> => {
  const client = await gateway();
  return client.get<Record<string, string | number | boolean>>("/settings/public");
});

/**
 * Every public setting, plus the two capabilities the gateway computes rather than stores.
 *
 * Exposed because not everything on this route is a setting. `onlinePaymentEnabled` and
 * `c2cPaymentConfigured` are answers derived from configuration the gateway alone holds, so they ride
 * along with the settings that are — one request, one memo, and no way for the storefront to compute a
 * payment capability out of its own environment and disagree with the process that would have to
 * honour it.
 */
export async function publicSettings(): Promise<PublicSettings> {
  return readPublic();
}

export type PublicSettings = Record<string, string | number | boolean> & {
  /** Whether the shop's online payment provider is configured. Computed by the gateway. */
  onlinePaymentEnabled?: boolean;
  /** Whether a card number has been entered for card-to-card. Computed by the gateway. */
  c2cPaymentConfigured?: boolean;
};

/**
 * One setting, or `null` when the shop has never stored it.
 *
 * The column key is what the caller knows — it is what `settingKeys` holds — and the gateway answers
 * in field names, so the translation happens here. That is one line in one file rather than the cast
 * table it replaces, and it is the only place the two vocabularies meet.
 */
function fieldForColumnKey(columnKey: string): string | undefined {
  for (const [field, key] of Object.entries(settingKeys)) {
    if (key === columnKey) return field;
  }
  return undefined;
}

export async function getSetting<T = unknown>(key: SettingKey): Promise<T | null> {
  const field = fieldForColumnKey(key);
  if (field === undefined) return null;
  const value = (await readPublic())[field];
  return value === undefined ? null : (value as T);
}

export async function getSettingOrDefault<T>(key: SettingKey, fallback: T): Promise<T> {
  const value = await getSetting<T>(key);
  return value === null || value === undefined ? fallback : value;
}

export { settingKeys, GatewayError };

// Typed settings accessor for the admin panel (011/017).
//
// This used to open the `Setting` table itself and carry a cast table to undo the JSON column — a
// number setting read raw is a string, and each caller had to know that. The cast table was also a
// second, silently-drifting copy of the definitions the gateway serves: a setting added to the shop was
// in the gateway's list and absent from this one, so it worked for the form and returned `null` here.
//
// Now it is one call to `GET /settings/values`, which answers at the stored type. The panel holds no
// knowledge of which settings exist, only of which ones it wants and what to do without them.

import { cache } from "react";
import { readThrough } from "@/lib/reads";
import { settingKeys, type SettingKey } from "@kmodern/schema/setting-keys";

/**
 * One read for every setting, memoised for the length of one render.
 *
 * `cache` from React and not a module variable, and the difference is the whole of it: a module-level
 * promise lives as long as the server process, so a setting an operator changed would be read once
 * and then served from memory for the rest of the deployment — the panel's own settings form would
 * save a value and the page that made the change would keep showing the old one. React's `cache`
 * scopes the memo to the request, so four pages asking in one render cost one call and a later render
 * re-reads.
 */
const readAll = cache(async (): Promise<Record<string, string | number | boolean>> =>
  readThrough<Record<string, string | number | boolean>>("/settings/values"),
);

export async function getSetting<T = unknown>(key: SettingKey): Promise<T | null> {
  const value = (await readAll())[key];
  return value === undefined ? null : (value as T);
}

export async function getSettingOrDefault<T>(key: SettingKey, fallback: T): Promise<T> {
  const value = (await readAll())[key];
  return value === undefined || value === null ? fallback : (value as T);
}

export { settingKeys };

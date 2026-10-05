// `<input type="datetime-local">` adapters, and nothing else.
//
// The Jalali formatting this file used to hold now lives in the kernel (`@kmodern/contracts`), beside
// `jalaliYear` and the Persian digit table: three implementations of "render a date for an Iranian
// operator" existed, and the two clients did not agree on the answer. `formatJalali`,
// `formatJalaliLong`, `formatJalaliDateTime`, `tehranTime` and `toJalali` are imported straight from
// the kernel by the pages that need them, so there is one rule and one home for it.
//
// What stays here is the part that is genuinely the panel's: the wall-clock convention an operator
// types into a form field, and the inverse. Those are form adapters, not a date contract, and no
// other surface types Tehran wall-clock time into a `datetime-local` input.

import { TEHRAN_TZ } from "@kmodern/contracts";

/** value for <input type="datetime-local"> — Tehran wall-clock, no seconds */
export function toDateTimeLocal(date: Date): string {
  const local = new Date(date.toLocaleString("en-US", { timeZone: TEHRAN_TZ }));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${local.getFullYear()}-${p(local.getMonth() + 1)}-${p(local.getDate())}T${p(local.getHours())}:${p(local.getMinutes())}`;
}

/** parse <input type="datetime-local"> value as a Date (wall-clock preserved) */
export function fromDateTimeLocal(value: string): Date {
  // datetime-local has no offset. Admin values are Tehran wall-clock time;
  // Iran is UTC+03:30 year-round in the current deployment.
  const normalized = value.endsWith("Z") ? value : value.length === 16 ? `${value}:00+03:30` : value.includes("+") ? value : `${value}+03:30`;
  return new Date(normalized);
}

/**
 * A `datetime-local` value out of a URL query, or `null` when it is not one.
 *
 * A query string is as much attacker input as operator input, and a malformed value reaching
 * `fromDateTimeLocal` yields `Invalid Date`, whose `toISOString()` throws — which would 500 the
 * whole screen rather than ignore one filter. The shape is the browser's own format, so a value
 * that fails it was not produced by this form and is safe to drop.
 */
export function validDateTimeLocal(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  return Number.isNaN(fromDateTimeLocal(value).getTime()) ? null : value;
}

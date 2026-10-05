// Jalali (Persian) calendar year — order numbering (009: "1404-000123",
// per-year counter resets each Persian New Year). Standard jalaali-js
// conversion (Gregorian → Jalali), local-time based (Iran is UTC+3:30).

// ---- Display formatting.
//
// `jalaliYear` above is arithmetic: the year an order number is filed under, in the server's own
// local time, for a counter that resets at the Persian new year. Everything below is presentation,
// and presenting a date is one rule the whole repo must share — three implementations existed (that
// arithmetic one, an ICU one inside the panel, and seven `toLocaleDateString("fa-IR")` calls in the
// storefront). A date rendered in the wrong zone is not cosmetic: it is yesterday's date on an order
// the operator is looking at.
//
// Conversion delegates to ICU (Node ships full-icu) and is pinned to Asia/Tehran, so the value does
// not depend on the zone the server happens to run in. Digits come from `format.ts` — a second
// Persian digit table here would be the same rule in two homes.

import { toFaDigits } from "./format";

/** Iran has one timezone year-round; the current deployment is UTC+03:30. */
export const TEHRAN_TZ = "Asia/Tehran";

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

export function toJalali(date: Date): JalaliDate {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: TEHRAN_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { jy: get("year"), jm: get("month"), jd: get("day") };
}

const MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

/** "۱۴۰۵/۰۷/۰۵" — month and day zero-padded, so columns of dates line up. */
export function formatJalali(date: Date): string {
  const { jy, jm, jd } = toJalali(date);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${toFaDigits(jy)}/${toFaDigits(pad(jm))}/${toFaDigits(pad(jd))}`;
}

/** "۵ مهر ۱۴۰۵" — the month named, for prose where a numeric date reads as data. */
export function formatJalaliLong(date: Date): string {
  const { jy, jm, jd } = toJalali(date);
  return `${toFaDigits(jd)} ${MONTHS[jm - 1]} ${toFaDigits(jy)}`;
}

/** "۱۴:۳۰" in Tehran time. ICU reports midnight as hour 24; it is 00 here. */
export function tehranTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: TEHRAN_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  const hour = get("hour") === "24" ? "00" : get("hour").padStart(2, "0");
  return toFaDigits(`${hour}:${get("minute").padStart(2, "0")}`);
}

/** "۱۴۰۵/۰۷/۰۵ ۱۴:۳۰" */
export function formatJalaliDateTime(date: Date): string {
  return `${formatJalali(date)} ${tehranTime(date)}`;
}

export function jalaliYear(date: Date = new Date()): number {
  const gy = date.getFullYear();
  const gm = date.getMonth() + 1; // 1-based
  const gd = date.getDate();

  const gDm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  const gy2 = gy <= 1600 ? gy : gy - 1600;
  const gy3 = gm > 2 ? gy2 + 1 : gy2;
  let days =
    365 * gy2 +
    Math.floor((gy3 + 3) / 4) -
    Math.floor((gy3 + 99) / 100) +
    Math.floor((gy3 + 399) / 400) -
    80 +
    gd +
    gDm[gm - 1];

  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;

  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }

  const leapJalali = days === 365;
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  void leapJalali;
  void jm;

  return jy;
}
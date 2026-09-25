// Jalali (Persian) calendar display helpers. Conversion delegates to ICU
// (Node ships full-icu), pinned to Asia/Tehran so wall-clock times match what
// an admin in Iran sees regardless of the server's own timezone. Order
// numbering uses UTC-based jalaliYear from @kmodern/schema (packages/db).

const TZ = "Asia/Tehran";

const persianDateParts = (date: Date) =>
  new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

export function toJalali(date: Date): JalaliDate {
  const parts = persianDateParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { jy: get("year"), jm: get("month"), jd: get("day") };
}

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
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

export function faDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

export function formatJalali(date: Date): string {
  const { jy, jm, jd } = toJalali(date);
  return `${faDigits(jy)}/${faDigits(String(jm).padStart(2, "0"))}/${faDigits(String(jd).padStart(2, "0"))}`;
}

export function formatJalaliLong(date: Date): string {
  const { jy, jm, jd } = toJalali(date);
  return `${faDigits(jd)} ${MONTHS[jm - 1]} ${faDigits(jy)}`;
}

/** "۱۴:۳۰" in Tehran time */
export function tehranTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const h = get("hour") === "24" ? "00" : get("hour").padStart(2, "0");
  return faDigits(`${h}:${get("minute").padStart(2, "0")}`);
}

export function formatJalaliDateTime(date: Date): string {
  return `${formatJalali(date)} ${tehranTime(date)}`;
}

/** value for <input type="datetime-local"> — Tehran wall-clock, no seconds */
export function toDateTimeLocal(date: Date): string {
  const local = new Date(date.toLocaleString("en-US", { timeZone: TZ }));
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

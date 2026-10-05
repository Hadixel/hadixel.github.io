import type { ScraperJobSnapshot, ScraperJobStatus } from "@/scraper/lib/scraper-types";

/**
 * Every Persian label the scraper panel shows, in one place. They used to be scattered through the
 * panel's render: the status and phase dictionaries above the component, the category dictionaries
 * between the widgets, and one more declared inside the price-list card on every render. A reader
 * asking "what does the panel call a hood" should not have to know which card asks.
 */

export interface LabelOption {
  value: string;
  label: string;
}

export const JOB_STATUS_LABELS: Record<ScraperJobStatus, { label: string; badgeClass: string }> = {
  idle: { label: "آماده", badgeClass: "bg-plaster text-ink" },
  running: { label: "در حال اجرا", badgeClass: "bg-flame-100 text-flame-800" },
  cancelling: { label: "در حال لغو", badgeClass: "bg-flame-100 text-flame-800" },
  completed: { label: "پایان یافت", badgeClass: "bg-emerald-100 text-emerald-900" },
  failed: { label: "ناموفق", badgeClass: "bg-red-100 text-red-800" },
  cancelled: { label: "لغو شد", badgeClass: "bg-flame-100 text-flame-800" },
};

export const JOB_PHASE_LABELS: Record<ScraperJobSnapshot["phase"], string> = {
  idle: "آماده",
  discovering: "پیدا کردن صفحه‌های محصول",
  scraping: "خواندن صفحه‌های محصول",
  refining: "پالایش متن و ادغام داده‌ها",
  downloading: "دریافت تصاویر محصولات",
  writing: "نوشتن فایل خروجی",
  complete: "پایان اجرا",
};

export const ROOT_LABELS: Record<string, string> = {
  sink: "سینک",
  hood: "هود",
  oven: "فر",
  stove: "اجاق گاز",
  "air-fryer": "سرخ‌کن",
};

export const SUB_LABELS: Record<string, string> = {
  "double-bowl": "دولگن",
  "built-in": "توکار",
  chimney: "شومینه‌ای",
  concealed: "مخفی",
  wall: "دیواری",
  steel: "استیل",
  granite: "گرانیتی",
  glass: "شیشه‌ای",
  freestanding: "رومیزی",
  "dual-basket": "دوسبد",
};

export const SCRAPE_SUB_LABELS: Record<string, string[]> = {
  sink: ["steel", "granite"],
  hood: ["chimney", "concealed", "wall", "glass"],
  oven: ["built-in", "steel", "glass"],
  stove: ["built-in", "freestanding"],
  "air-fryer": ["dual-basket"],
};

export const COLOR_LABELS: Record<string, string> = {
  black: "مشکی",
  white: "سفید",
  gray: "طوسی",
  beige: "کرم",
  silver: "نقره‌ای",
  steel: "استیل",
};

export const SCRAPE_FILTER_LABELS: Record<string, string> = {
  search: "جستجو",
  manufacturer: "سازنده",
  website: "وب‌سایت",
  category: "دسته",
  subCategory: "زیر‌دسته",
  color: "رنگ",
  price: "قیمت",
  content: "محتوا",
  sort: "ترتیب",
};

export const PRICE_MATCH_STATUS_LABELS: Record<string, string> = {
  "raw-only": "فقط در اسکرپ خام",
  unmatched: "بدون محصول",
  ambiguous: "تعارض",
  duplicate: "تکراری",
  invalid: "ردیف نامعتبر",
};

/** A label dictionary as the `<option>`/multi-select list the render wants it. */
export function labelOptions(labels: Record<string, string>): LabelOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

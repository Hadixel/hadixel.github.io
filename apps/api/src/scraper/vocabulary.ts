// The vocabulary of the scraper import: which categories exist, what they are called in Persian, and
// what a colour token means.
//
// These four tables used to live in `apps/admin/src/lib/scraper-import.ts`, and they are the reason
// that file could not simply be moved: a category's Persian name, the shipping weight the courier
// charges by, and the hex a colour renders as are rules about *this shop*, and the moment they sit in
// a client process the gateway is holding a catalogue it cannot describe. They travel with the
// operation that applies them, so the panel holds no vocabulary at all and the two copies of "what is
// a `chimney` hood" cannot exist.
//
// The tables are plain data and plain functions rather than a provider: nothing here wants injecting,
// and a rule a test cannot judge without a container is a rule that gets judged by hand.

/** How a scraped item's address has to look before it is stored. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** A root category: its Persian name and the weight the courier charges by. */
export const ROOT_META: Record<string, { name: string; weightKg: number }> = {
  sink: { name: "سینک", weightKg: 12 },
  hood: { name: "هود", weightKg: 18 },
  oven: { name: "فر", weightKg: 35 },
  stove: { name: "اجاق گاز", weightKg: 18 },
  "air-fryer": { name: "سرخ‌کن", weightKg: 6 },
};

/** A subcategory: the Persian name the child category takes. */
export const SUB_META: Record<string, string> = {
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

/** A colour token: the Persian name and the hex a swatch renders as. */
export const COLOR_META: Record<string, { name: string; code: string }> = {
  black: { name: "مشکی", code: "#1C1917" },
  white: { name: "سفید", code: "#FFFFFF" },
  gray: { name: "طوسی", code: "#6B7280" },
  beige: { name: "کرم", code: "#D6C3A1" },
  silver: { name: "نقره‌ای", code: "#C0C0C0" },
  steel: { name: "استیل", code: "#A8AEB7" },
};

/**
 * Which subcategories a root category may hold.
 *
 * The one table that is a *rule* rather than a label: the import refuses a subcategory that is not
 * listed here, because a child category under a hood that has never heard of a chimney is a row the
 * storefront's filters cannot offer and the operator did not choose.
 */
export const CATEGORY_SUBCATEGORIES: Record<string, string[]> = {
  sink: ["steel", "granite"],
  hood: ["chimney", "concealed", "wall", "glass"],
  oven: ["built-in", "steel", "glass"],
  stove: ["built-in", "freestanding"],
  "air-fryer": ["dual-basket", "double-bowl"],
};

/**
 * The brand's own address, used to derive a category's slug.
 *
 * Latin-only and falling back to `datees` — a Persian brand name has no Latin answer that is the same
 * answer twice, so it gets the house brand's slug rather than an empty one.
 */
export function brandSlug(value: string): string {
  return (
    value
      .toLocaleLowerCase("en")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "datees"
  );
}

/**
 * How a spec value is stored: as a number, a boolean, or text.
 *
 * Read off the scraped value rather than declared per field, which is what a scraped catalogue can
 * honestly offer — the same label arrives as `"۵"` from one manufacturer and `"5"` from another.
 */
export function specType(value: string): string {
  if (/^\d+(\.\d+)?$/.test(value)) return "number";
  if (/^(yes|no|true|false)$/i.test(value)) return "boolean";
  return "string";
}

/** Trimmed, de-duplicated, empty entries dropped — the shape every list column is stored in. */
export function cleanList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

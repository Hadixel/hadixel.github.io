// The one table of settings: what exists, what each value may be, and how the panel renders it.
//
// Three copies of this table existed and each was a rule the others could disagree with:
//
//   1. `apps/admin/src/app/(panel)/settings/page.tsx` — SECTION_DEFS, with labels and input types.
//   2. `apps/admin/src/lib/actions/settings.ts` — SECTIONS, with a field→type map and the bounds.
//   3. `packages/schema/src/setting-keys.ts` — the key names alone.
//
// (1) and (2) were the dangerous pair: the form rendered a `text` input for whatever (1) said, and
// (2) validated as whatever (2) said. Changing one without the other produced a form the gateway
// refused, or worse a value accepted as a string and read back as a number — `shipping.localFlatFee`
// is a `Float` inside a `Json` column, so nothing at the database level stops `"200000"` being stored
// and every later arithmetic on it becoming `"200000" + 1`.
//
// So the table is here, it is served over `GET /settings/definitions`, and the panel renders from
// what it is given. A field added to the shop is added once.

import { settingKeys, type SettingKey } from "@kmodern/schema/setting-keys";

/** How a value is typed in the column and rendered in the form. */
export type SettingFieldType = "text" | "number" | "enum";

export interface SettingFieldDef {
  /** The name the form and the API use. Resolved to a column key through `settingKeys`. */
  readonly key: string;
  readonly label: string;
  readonly type: SettingFieldType;
  /** The members of an `enum` field. Empty for the other types. */
  readonly enumValues?: readonly string[];
  /**
   * The value must be a whole number. Set for the fields that end up in a duration or a count, where
   * `30.5` minutes is a value no code can act on.
   */
  readonly integer?: boolean;
  /** The value must be at least this. Set where zero would mean "off" or "never". */
  readonly minimum?: number;
}

export interface SettingSectionDef {
  readonly key: string;
  readonly label: string;
  readonly icon: string;
  readonly description: string;
  readonly fields: readonly SettingFieldDef[];
}

/**
 * The order matters: it is the order the panel's sidebar renders, and a merchant reads the shop's
 * identity first and its webhook credentials last.
 */
export const SETTING_SECTIONS: readonly SettingSectionDef[] = [
  {
    key: "store",
    label: "فروشگاه",
    icon: "🏪",
    description: "مشخصات کلی فروشگاه و SEO پیش‌فرض",
    fields: [
      { key: "storeName", label: "نام فروشگاه", type: "text" },
      { key: "storeLogo", label: "آدرس لوگو", type: "text" },
      { key: "storeTagline", label: "شعار فروشگاه", type: "text" },
      { key: "storeContact", label: "راه‌های تماس", type: "text" },
      { key: "blogDefaultByline", label: "امضای پیش‌فرض وبلاگ", type: "text" },
      { key: "seoDefaultTitle", label: "عنوان پیش‌فرض SEO", type: "text" },
      { key: "seoDefaultDescription", label: "توضیح پیش‌فرض SEO", type: "text" },
    ],
  },
  {
    key: "shipping",
    label: "ارسال",
    icon: "🚚",
    description: "رژیم هزینه ارسال درون‌شهری و باربری",
    fields: [
      {
        key: "shippingLocalFeeMode",
        label: "نحوه هزینه ارسال درون‌شهر",
        type: "enum",
        enumValues: ["FREE", "FLAT", "API_QUOTE", "FALLBACK_FLAT", "FREIGHT_COLLECT"],
      },
      { key: "shippingLocalFlatFee", label: "کرایه ثابت درون‌شهر (تومان)", type: "number" },
      {
        key: "shippingPostWeightCap",
        label: "سقف وزن باربری (کیلوگرم، 0=خاموش)",
        type: "number",
      },
      {
        key: "shippingPostFallbackFee",
        label: "کرایه بازگشتی باربری (تومان، 0=ناموجود)",
        type: "number",
      },
      { key: "shippingMaxCodTotal", label: "سقف مبلغ پرداخت در محل (تومان)", type: "number" },
      { key: "shippingBarberiNote", label: "توضیح باربری", type: "text" },
    ],
  },
  {
    key: "payments",
    label: "پرداخت",
    icon: "💳",
    description: "پرداخت کارت‌به‌کارت (C2C) درگاه انسانی",
    fields: [
      { key: "paymentC2cCardNumber", label: "شماره کارت", type: "text" },
      { key: "paymentC2cCardHolder", label: "نام دارنده کارت", type: "text" },
      { key: "paymentC2cBankName", label: "نام بانک", type: "text" },
    ],
  },
  {
    key: "inventory",
    label: "انبار",
    icon: "📦",
    description: "آستانه موجودی کم و رزروهای تسویه",
    fields: [
      // Integer and non-negative: it is compared against a stock count, and 2.5 units of "low" is not
      // a threshold anything can act on. The panel enforced this by listing these three key names in
      // an array inside its action, which is the shape of a rule that has no home.
      { key: "inventoryLowStockThreshold", label: "آستانه موجودی کم", type: "number", integer: true },
      {
        key: "checkoutOnlineReserveMinutes",
        label: "مدت رزرو پرداخت آنلاین (دقیقه)",
        type: "number",
        integer: true,
        minimum: 1,
      },
      {
        key: "checkoutC2cReserveHours",
        label: "مدت رزرو پرداخت در محل (ساعت)",
        type: "number",
        integer: true,
        minimum: 1,
      },
    ],
  },
  {
    key: "notifications",
    label: "اعلان‌ها",
    icon: "🔔",
    description: "اعلان‌های مدیریتی",
    fields: [{ key: "adminAlertMobile", label: "موبایل اطلاع‌رسانی مدیریت", type: "text" }],
  },
];

/** Every field, flattened, for a lookup that does not care which section a key belongs to. */
export const SETTING_FIELDS: ReadonlyMap<string, SettingFieldDef> = new Map(
  SETTING_SECTIONS.flatMap((section) => section.fields.map((field) => [field.key, field] as const)),
);

/** The section a field belongs to, or `undefined` — an unknown key is refused, never defaulted. */
export function sectionOf(fieldKey: string): SettingSectionDef | undefined {
  return SETTING_SECTIONS.find((section) =>
    section.fields.some((field) => field.key === fieldKey),
  );
}

/** The section with this name, or `undefined`. */
export function findSection(sectionKey: string): SettingSectionDef | undefined {
  return SETTING_SECTIONS.find((section) => section.key === sectionKey);
}

/**
 * The column key a field name resolves to.
 *
 * Typed against `settingKeys` on purpose: a field added to the table above with a name that is not in
 * the contract is a compile error here rather than a `undefined` reaching the database at runtime.
 */
export function columnKeyFor(fieldKey: string): SettingKey {
  const resolved = (settingKeys as Record<string, SettingKey | undefined>)[fieldKey];
  if (resolved === undefined) {
    // Unreachable while the two declarations agree, and the check exists because "unreachable" is a
    // claim about a table that a later commit will edit.
    throw new Error(`setting field "${fieldKey}" has no entry in settingKeys`);
  }
  return resolved;
}

/**
 * The field name a column key belongs to.
 *
 * The reverse of `columnKeyFor`, and it exists so the *read* can answer in the vocabulary the form
 * uses. A panel building a form from these definitions addresses fields by name (`storeName`), while
 * the row it reads is keyed by column (`store.name`); making the gateway do the crossing means the
 * panel holds neither the mapping nor a copy of the key contract.
 */
export function fieldForColumnKey(columnKey: string): string | undefined {
  for (const fieldKey of SETTING_FIELDS.keys()) {
    if (columnKeyFor(fieldKey) === columnKey) return fieldKey;
  }
  return undefined;
}

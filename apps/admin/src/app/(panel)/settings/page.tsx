import { db } from "@kmodern/db";
import { faDigits } from "@/lib/date";
import { SettingsForm } from "@/components/settings-form";

export const dynamic = "force-dynamic";

const SECTION_DEFS = {
  store: {
    label: "فروشگاه",
    icon: "🏪",
    description: "مشخصات کلی فروشگاه و SEO پیش‌فرض",
    fields: [
      { key: "storeName", label: "نام فروشگاه", type: "text" as const },
      { key: "storeLogo", label: "آدرس لوگو", type: "text" as const },
      { key: "storeTagline", label: "شعار فروشگاه", type: "text" as const },
      { key: "storeContact", label: "راه‌های تماس", type: "text" as const },
      { key: "blogDefaultByline", label: "امضای پیش‌فرض وبلاگ", type: "text" as const },
      { key: "seoDefaultTitle", label: "عنوان پیش‌فرض SEO", type: "text" as const },
      { key: "seoDefaultDescription", label: "توضیح پیش‌فرض SEO", type: "text" as const },
    ],
  },
  shipping: {
    label: "ارسال",
    icon: "🚚",
    description: "رژیم هزینه ارسال درون‌شهری و باربری",
    fields: [
      { key: "shippingLocalFeeMode", label: "نحوه هزینه ارسال درون‌شهر", type: "enum" as const, enumValues: ["FREE", "FLAT", "API_QUOTE", "FALLBACK_FLAT", "FREIGHT_COLLECT"] },
      { key: "shippingLocalFlatFee", label: "کرایه ثابت درون‌شهر (تومان)", type: "number" as const },
      { key: "shippingPostWeightCap", label: "سقف وزن باربری (کیلوگرم، 0=خاموش)", type: "number" as const },
      { key: "shippingPostFallbackFee", label: "کرایه بازگشتی باربری (تومان، 0=ناموجود)", type: "number" as const },
      { key: "shippingMaxCodTotal", label: "سقف مبلغ پرداخت در محل (تومان)", type: "number" as const },
      { key: "shippingBarberiNote", label: "توضیح باربری", type: "text" as const },
    ],
  },
  payments: {
    label: "پرداخت",
    icon: "💳",
    description: "پرداخت کارت‌به‌کارت (C2C) درگاه انسانی",
    fields: [
      { key: "paymentC2cCardNumber", label: "شماره کارت", type: "text" as const },
      { key: "paymentC2cCardHolder", label: "نام دارنده کارت", type: "text" as const },
      { key: "paymentC2cBankName", label: "نام بانک", type: "text" as const },
    ],
  },
  inventory: {
    label: "انبار",
    icon: "📦",
    description: "آستانه موجودی کم و رزروهای تسویه",
    fields: [
      { key: "inventoryLowStockThreshold", label: "آستانه موجودی کم", type: "number" as const },
      { key: "checkoutOnlineReserveMinutes", label: "مدت رزرو پرداخت آنلاین (دقیقه)", type: "number" as const },
      { key: "checkoutC2cReserveHours", label: "مدت رزرو پرداخت در محل (ساعت)", type: "number" as const },
    ],
  },
  notifications: {
    label: "اعلان‌ها",
    icon: "🔔",
    description: "اعلان‌های مدیریتی",
    fields: [{ key: "adminAlertMobile", label: "موبایل اطلاع‌رسانی مدیریت", type: "text" as const }],
  },
};

export default async function SettingsPage() {
  const all = await db().setting.findMany();
  const valueOf = (key: string): unknown => all.find((s) => s.key === key)?.value;

  const current = (key: string): string => {
    const v = valueOf(key);
    if (typeof v === "number" || typeof v === "string") return String(v);
    return "";
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">تنظیمات</h1>
      <SettingsForm sections={SECTION_DEFS} initial={Object.fromEntries(all.map((s) => [s.key, current(s.key)]))} />
    </div>
  );
}
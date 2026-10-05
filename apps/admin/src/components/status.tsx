// Status → Persian label + badge color maps for every enum in the schema,
// so lists/chips render consistently across the panel.

import { Badge } from "@kmodern/ui";

export const STATUS_LABELS: Record<string, string> = {
  // ProductStatus
  DRAFT: "پیش‌نویس",
  PUBLISHED: "منتشر شده",
  ARCHIVED: "بایگانی",
  // FulfillmentStatus
  PENDING: "در انتظار",
  CONFIRMED: "تأیید شده",
  PROCESSING: "در حال پردازش",
  SHIPPED: "ارسال شده",
  DELIVERED: "تحویل شده",
  CANCELLED: "لغو شده",
  RETURNED: "مرجوعی",
  // PaymentStatus
  AWAITING: "در انتظار پرداخت",
  PAID: "پرداخت شده",
  REFUNDED: "استرداد شده",
  FAILED: "ناموفق",
  // PaymentMethod
  ONLINE: "آنلاین",
  CARD_TO_CARD: "کارت به کارت",
  COD: "پس کرایه",
  // ShippingMethod
  LOCAL: "ارسال محلی",
  POST: "پست",
  BARBERI: "باربری",
  // DeliveryFeeMode
  FREE: "رایگان",
  FLAT: "مبلغ ثابت",
  API_QUOTE: "استعلام آنلاین",
  FALLBACK_FLAT: "مبلغ جایگزین",
  FREIGHT_COLLECT: "پس کرایه",
  // PageStatus
  // (DRAFT/PUBLISHED shared)
  // PostStatus
  // (DRAFT/PUBLISHED/ARCHIVED shared)
  // DiscountType
  PERCENT: "درصدی",
  FIXED: "مبلغ ثابت",
  FREE_DELIVERY: "ارسال رایگان",
  // DiscountScope
  ALL: "کل سبد",
  PRODUCTS: "محصولات",
  CATEGORIES: "دسته‌بندی‌ها",
  COLLECTIONS: "مجموعه‌ها",
  // DiscountMode
  COUPON: "کد تخفیف",
  AUTOMATIC: "خودکار",
  // DiscountStatus
  ACTIVE: "فعال",
  DISABLED: "غیرفعال",
  // AdminRole
  OWNER: "مالک",
  EDITOR: "ویرایشگر",
  ORDER_MANAGER: "مدیر سفارش",
  // MenuLocation
  HEADER: "هدر",
  FOOTER: "فوتر",
  MOBILE: "موبایل",
  // ChildSource
  STATIC: "استاتیک",
  CATEGORY: "از دسته‌بندی",
  // ReservationStatus
  COMMITTED: "ثبت شده",
  RELEASED: "آزاد شده",
  EXPIRED: "منقضی",
  // PageKind
  SYSTEM: "سیستمی",
  CUSTOM: "سفارشی",
};

const CLASS_BY_STATUS: Record<string, string> = {
  DRAFT: "bg-plaster text-ink",
  PUBLISHED: "bg-emerald-100 text-emerald-900",
  ARCHIVED: "bg-flame-100 text-flame-800",
  PENDING: "bg-flame-100 text-flame-800",
  CONFIRMED: "bg-flame-100 text-flame-800",
  PROCESSING: "bg-plaster text-ink",
  SHIPPED: "bg-flame-100 text-flame-800",
  DELIVERED: "bg-emerald-100 text-emerald-900",
  CANCELLED: "bg-red-100 text-red-800",
  RETURNED: "bg-flame-100 text-flame-800",
  AWAITING: "bg-flame-100 text-flame-800",
  PAID: "bg-emerald-100 text-emerald-900",
  REFUNDED: "bg-plaster text-ink",
  FAILED: "bg-red-100 text-red-800",
  ACTIVE: "bg-emerald-100 text-emerald-900",
  DISABLED: "bg-plaster text-ink",
  // ReservationStatus
  COMMITTED: "bg-emerald-100 text-emerald-900",
  RELEASED: "bg-plaster text-ink",
  EXPIRED: "bg-flame-100 text-flame-800",
};

export function statusColor(status: string) {
  return CLASS_BY_STATUS[status] ?? "bg-plaster text-ink";
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge className={statusColor(status)}>{STATUS_LABELS[status] ?? status}</Badge>;
}

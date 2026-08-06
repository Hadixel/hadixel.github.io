"use client";

// Status → Persian label + badge color maps for every enum in the schema,
// so lists/chips render consistently across the panel.

import { Badge } from "./ui";

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

const COLOR_BY_STATUS: Record<string, "gray" | "green" | "amber" | "red" | "blue" | "violet" | "rose" | "teal"> = {
  DRAFT: "gray",
  PUBLISHED: "green",
  ARCHIVED: "amber",
  PENDING: "amber",
  CONFIRMED: "blue",
  PROCESSING: "violet",
  SHIPPED: "blue",
  DELIVERED: "green",
  CANCELLED: "red",
  RETURNED: "rose",
  AWAITING: "amber",
  PAID: "green",
  REFUNDED: "violet",
  FAILED: "red",
  ACTIVE: "green",
  DISABLED: "gray",
  // ReservationStatus
  COMMITTED: "green",
  RELEASED: "gray",
  EXPIRED: "amber",
};

export function statusColor(status: string) {
  return COLOR_BY_STATUS[status] ?? "gray";
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge color={statusColor(status)}>{STATUS_LABELS[status] ?? status}</Badge>;
}

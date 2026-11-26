"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { useCart } from "@/cart/components/cart-provider";
import {
  ADDRESS_LINE_MIN_LENGTH,
  isCheckoutAddressComplete,
  parseCheckoutServerError,
  validateAddressLine,
  validatePostalCode,
  validateRecipientPhone,
  type CheckoutAddressField,
} from "@/checkout/lib/address-validation";
import { quoteKeyOf } from "@/checkout/lib/quote-key";
import { digitsOnly, iranCities, iranProvinces, sanitizePhoneInput, sanitizePostalCodeInput } from "@kmodern/contracts";
import { formatCardNumber, formatToman, toFaDigits } from "@kmodern/contracts/format";
import OtpModal from "@/account/components/otp-modal";
import { CopyButton } from "@/components/copy-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusNotice } from "@/components/status-notice";
import { SearchablePicker } from "./searchable-picker";
import { PROVINCE_ALIASES } from "@/checkout/lib/picker-search";

interface Totals {
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  total: number;
  freeDelivery: boolean;
  shippingMethod: "LOCAL" | "POST" | "BARBERI";
  shippingNote?: string;
  couponError?: string;
  appliedDiscounts: unknown[];
}

interface Line {
  variantId: string;
  qty: number;
  productName: string;
  colorName: string;
  price: number;
  lineTotal: number;
  image: string | null;
}

export interface C2cPaymentDetails {
  cardNumber?: string;
  iban?: string;
  cardHolder?: string;
  bankName?: string;
}

export default function CheckoutClient({
  onlineEnabled,
  c2cConfigured,
  c2cDetails,
}: {
  onlineEnabled: boolean;
  c2cConfigured: boolean;
  c2cDetails?: C2cPaymentDetails;
}) {
  const { lines, clear, remove } = useCart();
  const router = useRouter();

  const c2cCardNumber = c2cDetails?.cardNumber || "6063731100802066";
  const c2cIban = c2cDetails?.iban || "IR570600561170009820151001";
  const c2cCardHolder = c2cDetails?.cardHolder || "خانه مدرن";
  const c2cBankName = c2cDetails?.bankName || "بانک مهر ایران";

  const [cartData, setCartData] = useState<{ lines: Line[]; subtotal: number } | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"ONLINE" | "CARD_TO_CARD" | null>(() =>
    onlineEnabled ? "ONLINE" : c2cConfigured ? "CARD_TO_CARD" : null,
  );
  const [coupon, setCoupon] = useState("");
  const [couponExpanded, setCouponExpanded] = useState(false);
  const [couponMsg, setCouponMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [previewedKey, setPreviewedKey] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addressLineTouched, setAddressLineTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [postalTouched, setPostalTouched] = useState(false);
  const [serverFieldErrors, setServerFieldErrors] = useState<Partial<Record<CheckoutAddressField, string>>>({});
  const [showOtp, setShowOtp] = useState(false);
  const previewRequestRef = useRef(0);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cities = useMemo(
    () => (province ? iranCities.filter((item) => item.provinceId === iranProvinces.find((item) => item.name === province)?.id) : []),
    [province],
  );

  useEffect(() => {
    if (lines.length === 0) {
      setCartData({ lines: [], subtotal: 0 });
      setCartError(null);
      return;
    }
    let cancelled = false;
    setCartError(null);
    fetch("/api/cart/enrich", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(lines),
    })
      .then((response) => {
        if (!response.ok) throw new Error("cart-enrich");
        return response.json();
      })
      .then((json: { lines: Line[]; subtotal: number; rejectedVariantIds?: string[] }) => {
        if (cancelled) return;
        if (json.rejectedVariantIds?.length) {
          json.rejectedVariantIds.forEach((variantId) => remove(variantId));
          setCartError("چند کالای ناموجود از سبد حذف شدند. صفحه را دوباره باز کنید تا خلاصه سفارش تازه‌سازی شود.");
          return;
        }
        setCartData(json);
      })
      .catch(() => {
        if (!cancelled) setCartError("سبد خرید آماده محاسبه نیست. صفحه را تازه‌سازی کنید.");
      });
    return () => { cancelled = true; };
  }, [lines, remove]);

  function clearServerFieldError(field: CheckoutAddressField) {
    setServerFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  const recipientName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const addressComplete =
    Boolean(cartData?.lines.length) &&
    isCheckoutAddressComplete({
      firstName,
      lastName,
      recipientPhone,
      province,
      city,
      addressLine,
      postalCode,
    });
  const address = {
    recipientName,
    recipientPhone,
    province,
    city,
    addressLine: addressLine.trim(),
    postalCode,
  };
  const addressLineError =
    serverFieldErrors.addressLine ??
    (addressLineTouched ? validateAddressLine(addressLine, { required: true }) : null);
  const phoneError =
    serverFieldErrors.recipientPhone ??
    (phoneTouched ? validateRecipientPhone(recipientPhone, { required: true }) : null);
  const postalCodeError =
    serverFieldErrors.postalCode ??
    (postalTouched ? validatePostalCode(postalCode, { required: true }) : null);

  // What the quote costs from — the destination, the basket, a coupon — never from the street or the
  // recipient. Keying the refresh on the whole address is what blanked and re-fetched the shipping
  // row on every character typed; see quote-key.ts.
  const quoteKey = quoteKeyOf({ address, lines: cartData?.lines ?? [], couponCode: coupon });
  const totalsAreCurrent = Boolean(totals && previewedKey === quoteKey);
  // A refresh in flight on top of a quote already on screen. The previous row is what stays put
  // until the next one lands; this is what tells the shopper the number shown is the old one.
  const refreshPending = Boolean(totals) && (!totalsAreCurrent || previewBusy);
  const paymentMethods = [
    onlineEnabled && { id: "ONLINE" as const, label: "پرداخت آنلاین", desc: "انتقال امن به درگاه زرینپال" },
    c2cConfigured && { id: "CARD_TO_CARD" as const, label: "کارت به کارت", desc: "واریز و ارسال تصویر رسید" },
  ].filter(Boolean) as Array<{ id: "ONLINE" | "CARD_TO_CARD"; label: string; desc: string }>;
  const paymentAvailable = paymentMethods.some((method) => method.id === paymentMethod);
  const canPlaceOrder = totalsAreCurrent && !previewBusy && paymentAvailable;

  useEffect(() => {
    // Bumped first, so a request still in flight for an address that is no longer complete is
    // discarded by the time its answer arrives, rather than landing on a cleared form.
    const requestId = ++previewRequestRef.current;
    if (!addressComplete) {
      setTotals(null);
      setPreviewedKey(null);
      setPreviewBusy(false);
      return;
    }
    if (previewedKey === quoteKey) return;
    // The quote on screen is left standing. Clearing it here — while the address is still complete,
    // merely different — is what destroyed and rebuilt the shipping row on every keystroke, and a
    // row that keeps being remounted is a row a shopper cannot finish reading. previewedKey is what
    // holds the order button shut while this refresh is outstanding, so nothing can be submitted
    // against a quote that is still on its way.
    setPreviewedKey(null);
    setError(null);
    // Busy from the moment the request is scheduled, not from the moment it is sent: while the
    // shopper waits out the debounce, the placeholder already says the delivery fee is being worked
    // out rather than asking for an address that is already complete.
    setPreviewBusy(true);
    const timer = setTimeout(() => void previewTotals(), PREVIEW_DEBOUNCE_MS);
    previewTimerRef.current = timer;
    // A change inside the window replaces the pending request rather than queueing one behind it.
    return () => clearTimeout(timer);
    // previewTotals intentionally reads the current validated address/cart snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, addressComplete]);

  async function previewTotals(overrideCoupon?: string, requestId = ++previewRequestRef.current) {
    if (!cartData || !addressComplete) return;
    // A quote asked for by hand supersedes one still waiting out the debounce: both would price the
    // same parcel, and the carrier's answer is a thing a shop pays for twice.
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setPreviewBusy(true);
    setError(null);
    setServerFieldErrors({});
    const activeCoupon = overrideCoupon !== undefined ? overrideCoupon : coupon;
    const currentAddress = address;
    try {
      const response = await fetch("/api/checkout/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: currentAddress,
          items: cartData.lines.map((line) => ({ variantId: line.variantId, qty: line.qty })),
          couponCode: activeCoupon.trim() || undefined,
        }),
      });
      const json = await response.json();
      if (requestId !== previewRequestRef.current) return;
      if (!response.ok) {
        // The previous quote stays up. A refused preview — a carrier that is down, an address the
        // rules do not accept — is not the same as the delivery no longer existing, and emptying the
        // row here is what used to take the price off the page with it. previewedKey is left unset so
        // the row reads as stale and the order button stays shut until a quote arrives.
        const parsed = parseCheckoutServerError(json.error, "محاسبه سفارش انجام نشد.");
        if (parsed.field) {
          setServerFieldErrors((prev) => ({ ...prev, [parsed.field!]: parsed.message }));
        } else {
          setError(parsed.message);
        }
        return;
      }
      setTotals(json.totals);
      setPreviewedKey(quoteKeyOf({ address: currentAddress, lines: cartData.lines, couponCode: activeCoupon }));
      if (activeCoupon.trim() && json.totals?.couponError) setCouponMsg({ kind: "error", text: json.totals.couponError });
      else if (activeCoupon.trim() && json.totals?.discountAmount > 0) setCouponMsg({ kind: "ok", text: `کد تخفیف اعمال شد — ${formatToman(json.totals.discountAmount)} تخفیف` });
      else if (activeCoupon.trim()) setCouponMsg({ kind: "error", text: "کد تخفیف معتبر نیست." });
      else setCouponMsg(null);
    } catch {
      if (requestId === previewRequestRef.current) setError("خطای شبکه هنگام محاسبه سفارش رخ داد.");
    } finally {
      if (requestId === previewRequestRef.current) setPreviewBusy(false);
    }
  }

  function handleRemoveCoupon() {
    setCoupon("");
    setCouponMsg(null);
    void previewTotals("");
  }

  async function placeOrder() {
    if (!cartData || !canPlaceOrder || placing) return;
    setPlacing(true);
    setError(null);
    setServerFieldErrors({});
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address,
          items: cartData.lines.map((line) => ({ variantId: line.variantId, qty: line.qty })),
          paymentMethod,
          couponCode: coupon.trim() || undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setShowOtp(true);
          return;
        }
        const parsed = parseCheckoutServerError(json.error, "خطا در ثبت سفارش.");
        if (parsed.field) {
          setServerFieldErrors((prev) => ({ ...prev, [parsed.field!]: parsed.message }));
        } else {
          setError(parsed.message);
        }
        return;
      }
      clear();
      if (paymentMethod === "ONLINE") {
        const pay = await fetch(`/api/orders/${json.order.id}/pay`, { method: "POST" });
        const payment = await pay.json();
        if (pay.ok && payment.url) {
          router.push(payment.url);
          return;
        }
        router.push(`/order/${json.order.orderNumber}?payment=pending&payError=${encodeURIComponent(payment.error ?? "خطا در اتصال به درگاه پرداخت")}`);
      } else {
        router.push(`/order/${json.order.orderNumber}?payment=c2c`);
      }
    } catch {
      setError("خطای شبکه هنگام ثبت سفارش رخ داد.");
    } finally {
      setPlacing(false);
    }
  }

  if (cartError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <StatusNotice tone="danger" title="آماده‌سازی تسویه حساب ناموفق بود" role="alert">{cartError}</StatusNotice>
      </div>
    );
  }

  if (!cartData || cartData.lines.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <EmptyState
          title="سبد خرید برای تسویه خالی است"
          description="برای ادامه، یک یا چند محصول به سبد خرید اضافه کنید."
          action={{ label: "مشاهده محصولات", href: "/products" }}
        />
      </div>
    );
  }

  const methodLabel = {
    LOCAL: "ارسال درونشهری کرمان",
    POST: "پست پیشتاز",
    BARBERI: "باربری",
  }[totals?.shippingMethod ?? "BARBERI"];

  const isCouponApplied = Boolean(totals && totals.discountAmount > 0 && couponMsg?.kind === "ok");

  return (
    <div className="checkout-mobile-surface mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <PageHeader title="تسویه حساب" description="آدرس، روش ارسال و پرداخت را مرور کنید؛ مبلغ نهایی پیش از ثبت سفارش نمایش داده می‌شود." />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <CheckoutSection step="۱" title="آدرس گیرنده" description="اطلاعات باید دقیقاً با نشانی تحویل مطابقت داشته باشد.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="نام" htmlFor="first-name" error={serverFieldErrors.recipientName} errorId="recipient-name-error">
                <input
                  id="first-name"
                  value={firstName}
                  onChange={(event) => {
                    setFirstName(event.target.value);
                    clearServerFieldError("recipientName");
                  }}
                  className={fieldInputCls(Boolean(serverFieldErrors.recipientName))}
                  placeholder="مثلاً علی"
                  autoComplete="given-name"
                  aria-invalid={Boolean(serverFieldErrors.recipientName) || undefined}
                  aria-describedby={serverFieldErrors.recipientName ? "recipient-name-error" : undefined}
                />
              </Field>
              <Field label="نام خانوادگی" htmlFor="last-name">
                <input
                  id="last-name"
                  value={lastName}
                  onChange={(event) => {
                    setLastName(event.target.value);
                    clearServerFieldError("recipientName");
                  }}
                  className={fieldInputCls(Boolean(serverFieldErrors.recipientName))}
                  placeholder="مثلاً محمدی"
                  autoComplete="family-name"
                  aria-invalid={Boolean(serverFieldErrors.recipientName) || undefined}
                />
              </Field>
              <Field label="شماره موبایل" htmlFor="recipient-phone" error={phoneError} errorId="recipient-phone-error">
                <input
                  id="recipient-phone"
                  value={recipientPhone}
                  onChange={(event) => {
                    setRecipientPhone(sanitizePhoneInput(event.target.value));
                    clearServerFieldError("recipientPhone");
                  }}
                  onBlur={() => setPhoneTouched(true)}
                  className={fieldInputCls(Boolean(phoneError))}
                  placeholder="09xxxxxxxxx"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="tel"
                  aria-invalid={Boolean(phoneError) || undefined}
                  aria-describedby={phoneError ? "recipient-phone-error" : undefined}
                />
              </Field>
              <Field label="کد پستی" htmlFor="postal-code" error={postalCodeError} errorId="postal-code-error">
                <input
                  id="postal-code"
                  value={postalCode}
                  onChange={(event) => {
                    setPostalCode(sanitizePostalCodeInput(event.target.value));
                    clearServerFieldError("postalCode");
                  }}
                  onBlur={() => setPostalTouched(true)}
                  className={fieldInputCls(Boolean(postalCodeError))}
                  placeholder="۱۰ رقم"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  aria-invalid={Boolean(postalCodeError) || undefined}
                  aria-describedby={postalCodeError ? "postal-code-error" : undefined}
                />
              </Field>
              <Field label="استان" htmlFor="province" error={serverFieldErrors.province} errorId="province-error">
                <SearchablePicker
                  id="province"
                  value={province}
                  onChange={(newProv) => {
                    setProvince(newProv);
                    setCity("");
                    clearServerFieldError("province");
                    clearServerFieldError("city");
                  }}
                  options={iranProvinces}
                  aliasesMap={PROVINCE_ALIASES}
                  placeholder="انتخاب استان"
                  searchPlaceholder="جستجوی استان (فارسی یا انگلیسی e.g. kerman)..."
                  emptyMessage="استانی با این مشخصات یافت نشد"
                />
              </Field>
              <Field label="شهر" htmlFor="city" error={serverFieldErrors.city} errorId="city-error">
                <SearchablePicker
                  id="city"
                  value={city}
                  onChange={(newCity) => {
                    setCity(newCity);
                    clearServerFieldError("city");
                  }}
                  options={cities}
                  placeholder={province ? "انتخاب شهر" : "ابتدا استان را انتخاب کنید"}
                  searchPlaceholder="جستجوی شهر (فارسی یا انگلیسی e.g. kerman)..."
                  emptyMessage="شهری با این مشخصات یافت نشد"
                  disabled={!province}
                />
              </Field>
              <div className="md:col-span-2">
                <Field
                  label="آدرس کامل"
                  htmlFor="address-line"
                  hint={addressLine.trim().length > 0 && addressLine.trim().length < ADDRESS_LINE_MIN_LENGTH ? "حداقل ۵ کاراکتر" : undefined}
                  error={addressLineError}
                  errorId="address-line-error"
                >
                  <textarea
                    id="address-line"
                    value={addressLine}
                    onChange={(event) => {
                      setAddressLine(event.target.value);
                      clearServerFieldError("addressLine");
                    }}
                    onBlur={() => setAddressLineTouched(true)}
                    className={fieldInputCls(Boolean(addressLineError), "min-h-24 resize-y")}
                    rows={2}
                    placeholder="خیابان، کوچه، پلاک، واحد"
                    autoComplete="street-address"
                    aria-invalid={Boolean(addressLineError) || undefined}
                    aria-describedby={addressLineError ? "address-line-error" : undefined}
                  />
                </Field>
              </div>
            </div>
          </CheckoutSection>

          <CheckoutSection step="۲" title="روش ارسال" description="روش ارسال پس از تکمیل آدرس به‌صورت خودکار محاسبه می‌شود.">
            {totals ? (
              <div aria-busy={refreshPending} className="flex min-h-16 items-center justify-between gap-4 rounded-card bg-flame-50 px-4 py-4">
                <div>
                  <div className="text-sm font-bold text-flame-900">{methodLabel}</div>
                  <div className="mt-1 text-xs leading-6 text-flame-800/75">{totals.shippingNote || "هزینه ارسال بر اساس مقصد و وزن سفارش محاسبه شده است."}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-sm font-bold tabular-nums text-flame-900">
                  {refreshPending && (
                    <>
                      <span className="size-4 animate-spin rounded-pill border-2 border-flame-200 border-t-flame-700" aria-hidden />
                      <span className="sr-only">در حال به‌روزرسانی هزینه ارسال…</span>
                    </>
                  )}
                  {totals.freeDelivery ? "رایگان" : formatToman(totals.deliveryFee)}
                </div>
              </div>
            ) : (
              <div className="flex min-h-16 items-center gap-3 rounded-card bg-plaster px-4 text-sm text-ash">
                {previewBusy && <span className="size-4 animate-spin rounded-pill border-2 border-fog border-t-flame-700" aria-hidden />}
                {previewBusy ? "در حال محاسبه هزینه ارسال…" : addressComplete ? "در حال آماده‌سازی گزینه ارسال…" : "برای محاسبه ارسال، آدرس کامل را تکمیل کنید."}
              </div>
            )}
          </CheckoutSection>

          <CheckoutSection step="۳" title="روش پرداخت" description="یکی از روش‌های فعال فروشگاه را انتخاب کنید.">
            <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="روش پرداخت">
              {paymentMethods.map((method) => {
                const active = paymentMethod === method.id;
                return (
                  <button
                    key={method.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPaymentMethod(method.id)}
                    className={`min-h-28 rounded-card border p-4 text-right transition ${
                      active
                        ? "border-flame-700 bg-flame-50 ring-1 ring-flame-700"
                        : "border-fog bg-canvas hover:border-flame-300 hover:bg-flame-50/40"
                    }`}
                  >
                    <span
                      className={`mb-4 flex size-5 items-center justify-center rounded-pill border transition ${
                        active ? "border-flame-700" : "border-fog"
                      }`}
                      aria-hidden
                    >
                      {active && <span className="size-2.5 rounded-pill bg-flame-700" />}
                    </span>
                    <span className="block text-sm font-bold text-ink">{method.label}</span>
                    <span className="mt-1.5 block text-xs leading-5 text-ash">{method.desc}</span>
                  </button>
                );
              })}
            </div>
            {!paymentAvailable && (
              <div className="mt-4">
                <StatusNotice tone="warning">
                  برای این سفارش هیچ روش پرداخت فعالی وجود ندارد.
                </StatusNotice>
              </div>
            )}
             {paymentMethod === "CARD_TO_CARD" && (
                <div className="mt-4 rounded-card border border-flame-200/80 bg-flame-50/60 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-flame-200/50 pb-3">
                    <span className="text-xs font-bold text-flame-950">اطلاعات حساب جهت پرداخت کارت به کارت</span>
                    <span className="text-xs font-medium text-flame-900">{c2cCardHolder}{c2cCardHolder && c2cBankName ? " — " : ""}{c2cBankName}</span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {/* Card Number */}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-canvas p-3 sm:p-4 shadow-sm border border-flame-100">
                      <div>
                        <div className="text-xs font-semibold text-ash">شماره کارت:</div>
                        <div className="mt-1 font-mono text-base sm:text-lg font-bold tracking-widest text-ink" dir="ltr">
                          {formatCardNumber(c2cCardNumber)}
                        </div>
                      </div>
                      <CopyButton value={digitsOnly(c2cCardNumber) || c2cCardNumber} label="کپی شماره کارت" />
                    </div>

                    {/* IBAN */}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-canvas p-3 sm:p-4 shadow-sm border border-flame-100">
                      <div>
                        <div className="text-xs font-semibold text-ash">شماره شبا (IBAN):</div>
                        <div className="mt-1 font-mono text-sm sm:text-base font-bold tracking-wider text-ink" dir="ltr">
                          {c2cIban}
                        </div>
                      </div>
                      <CopyButton value={c2cIban} label="کپی شماره شبا" />
                    </div>
                  </div>

                  <p className="mt-3.5 text-xs leading-6 text-flame-900">
                    لطفاً پس از واریز به یکی از شماره‌های بالا، دکمه «ثبت نهایی سفارش» را بزنید تا سفارش شما ثبت گردد و راهنمای ارسال فیش نمایش داده شود.
                  </p>
                </div>
              )}
          </CheckoutSection>
        </div>

        <aside className="store-sticky rounded-card bg-plaster/70 p-5 lg:p-6" aria-label="خلاصه سفارش">
          <h2 className="font-display text-xl font-black text-ink">خلاصه سفارش</h2>
          <div className="mt-5 max-h-72 space-y-4 overflow-y-auto pl-1">
            {cartData.lines.map((line) => (
              <div key={line.variantId} className="flex items-center gap-3">
                <div className="relative size-14 shrink-0 overflow-hidden rounded-card bg-canvas">
                  {line.image && <Image src={line.image} alt={line.productName} fill sizes="56px" className="object-contain p-1 mix-blend-multiply" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-ink">{line.productName}</div>
                  <div className="mt-1 text-micro text-ash">{line.colorName} · {toFaDigits(line.qty)} عدد</div>
                </div>
                <div className="shrink-0 text-xs font-bold tabular-nums text-ink">{formatToman(line.lineTotal)}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-fog pt-5">
            {isCouponApplied && totals ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink">کد تخفیف اعمال‌شده</span>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="text-xs font-medium text-red-600 hover:text-red-700 transition hover:underline"
                  >
                    حذف کد
                  </button>
                </div>
                <div className="flex items-center justify-between rounded-card border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-xs text-emerald-900">
                  <div className="flex items-center gap-2">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-emerald-700"
                      aria-hidden
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span className="font-mono font-bold tracking-wider">{coupon}</span>
                  </div>
                  <span className="font-bold tabular-nums text-emerald-700">{formatToman(totals.discountAmount)} تخفیف</span>
                </div>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => setCouponExpanded((prev) => !prev)}
                  className="group flex w-full items-center justify-between py-1 text-xs font-bold text-ink transition hover:text-flame-700"
                  aria-expanded={couponExpanded}
                >
                  <span className="flex items-center gap-2">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-ash transition group-hover:text-flame-700"
                      aria-hidden
                    >
                      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                      <line x1="7" y1="7" x2="7.01" y2="7" />
                    </svg>
                    <span>کد تخفیف دارید؟</span>
                  </span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`text-ash transition-transform duration-200 group-hover:text-flame-700 ${couponExpanded ? "rotate-180" : ""}`}
                    aria-hidden
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {couponExpanded && (
                  <div className="mt-3">
                    <div className="flex gap-2">
                      <input
                        id="coupon"
                        value={coupon}
                        onChange={(event) => {
                          setCoupon(event.target.value);
                          setCouponMsg(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            if (!previewBusy && coupon.trim() && addressComplete) {
                              void previewTotals();
                            }
                          }
                        }}
                        className={inputCls}
                        placeholder="مثلاً WELCOME"
                        dir="ltr"
                      />
                      <Button
                        variant="outline"
                        onPress={() => void previewTotals()}
                        isDisabled={previewBusy || !coupon.trim() || !addressComplete}
                        className="shrink-0"
                      >
                        اعمال
                      </Button>
                    </div>
                    {couponMsg && (
                      <p className={`mt-2 text-xs leading-5 ${couponMsg.kind === "error" ? "text-red-700" : "text-emerald-700"}`}>
                        {couponMsg.text}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-5 space-y-2.5 border-t border-fog pt-5 text-sm">
            <div className="flex justify-between gap-3"><span className="text-ash">جمع کالاها</span><span className="text-price text-ink">{formatToman(cartData.subtotal)}</span></div>
            {totals?.discountAmount ? <div className="flex justify-between gap-3 text-emerald-700"><span>تخفیف</span><span className="tabular-nums">− {formatToman(totals.discountAmount)}</span></div> : null}
            {totals && <div className="flex justify-between gap-3"><span className="text-ash">ارسال</span><span className="text-price text-ink">{totals.freeDelivery ? "رایگان" : formatToman(totals.deliveryFee)}</span></div>}
          </div>

          <div className="mt-5 flex items-end justify-between gap-3 border-t border-fog pt-5">
            <span className="font-bold text-ink">مبلغ نهایی</span>
            <span className="font-display text-xl font-black tabular-nums text-ink">{totals ? formatToman(totals.total) : "—"}</span>
          </div>

          {error && <div className="mt-4"><StatusNotice tone="danger" role="alert">{error}</StatusNotice></div>}

          <Button onPress={() => void placeOrder()} isDisabled={!canPlaceOrder || placing} className="mt-5 min-h-12 w-full" variant="primary">
            {placing ? "در حال ثبت سفارش…" : "ثبت نهایی سفارش"}
          </Button>
          <p className="mt-3 text-center text-micro leading-5 text-ash">با ثبت سفارش، نشانی و روش پرداخت انتخاب‌شده نهایی می‌شود.</p>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-plaster bg-canvas/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(17,17,17,0.08)] backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-micro text-ash">مبلغ نهایی</div>
            <div className="truncate text-sm font-black tabular-nums text-ink">{totals ? formatToman(totals.total) : "پس از تکمیل آدرس"}</div>
          </div>
          <Button onPress={() => void placeOrder()} isDisabled={!canPlaceOrder || placing} className="min-h-11 min-w-40">{placing ? "در حال ثبت…" : "ثبت سفارش"}</Button>
        </div>
      </div>

      {showOtp && (
        <OtpModal
          phone={recipientPhone}
          onClose={() => setShowOtp(false)}
          onSuccess={() => {
            setShowOtp(false);
            void placeOrder();
          }}
        />
      )}
    </div>
  );
}

const inputBaseCls = "min-h-11 w-full rounded-card border bg-canvas px-3 py-2 text-sm text-ink outline-none transition placeholder:text-slate-line disabled:cursor-not-allowed disabled:bg-plaster disabled:text-ash";

function fieldInputCls(hasError: boolean, extra = "") {
  const stateCls = hasError
    ? "border-red-500 focus:border-red-600 focus:ring-2 focus:ring-red-100"
    : "border-fog focus:border-flame-700 focus:ring-2 focus:ring-flame-100";
  return `${inputBaseCls} ${stateCls}${extra ? ` ${extra}` : ""}`;
}

const inputCls = fieldInputCls(false);

/**
 * How long a change to the quote's inputs waits before it is asked for.
 *
 * The inputs that move the quote are discrete — two selects, one button — except that choosing a
 * province clears the city, which is a single gesture producing two keys in a row. Without a wait,
 * that gesture fired a quote for a city the shopper had just left, and that quote's answer could not
 * change the row it was already showing. The window is what lets one gesture cost one question; it is
 * not a pause before the shopper's action, because a key that changes still holds the order button.
 */
const PREVIEW_DEBOUNCE_MS = 400;

function CheckoutSection({ step, title, description, children }: { step: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card bg-canvas p-5 shadow-[var(--surface-shadow)] sm:p-6">
      <div className="mb-5 flex items-start gap-3 border-b border-plaster pb-4">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-flame-700 text-xs font-bold text-white" aria-hidden>{step}</span>
        <div>
          <h2 className="font-display text-lg font-black text-ink">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-ash">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  errorId,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  errorId?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold text-ink">
        {label}
        {hint && <span className="font-normal text-ash">{hint}</span>}
      </span>
      {children}
      {error && (
        <p id={errorId} className="mt-1.5 text-xs leading-5 text-red-700" role="alert">
          {error}
        </p>
      )}
    </label>
  );
}

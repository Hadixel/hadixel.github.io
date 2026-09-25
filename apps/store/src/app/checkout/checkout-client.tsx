"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { useCart } from "@/components/cart-provider";
import { iranCities, iranProvinces } from "@kmodern/schema";
import { formatToman, toFaDigits } from "@kmodern/schema/format";
import OtpModal from "@/components/otp-modal";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusNotice } from "@/components/status-notice";

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

export default function CheckoutClient({ onlineEnabled, c2cConfigured }: { onlineEnabled: boolean; c2cConfigured: boolean }) {
  const { lines, clear, remove } = useCart();
  const router = useRouter();

  const [cartData, setCartData] = useState<{ lines: Line[]; subtotal: number } | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"ONLINE" | "CARD_TO_CARD" | "COD">(() => (onlineEnabled ? "ONLINE" : c2cConfigured ? "CARD_TO_CARD" : "COD"));
  const [coupon, setCoupon] = useState("");
  const [couponMsg, setCouponMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [previewedKey, setPreviewedKey] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOtp, setShowOtp] = useState(false);
  const previewRequestRef = useRef(0);

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

  const addressComplete = Boolean(recipientName && recipientPhone && province && city && addressLine && postalCode && cartData?.lines.length);
  const addressKey = [recipientName, recipientPhone, province, city, addressLine, postalCode].map((value) => value.trim()).join("|");
  const cartKey = cartData?.lines.map((line) => `${line.variantId}:${line.qty}`).join(",") ?? "";
  const previewKey = `${addressKey}|${coupon.trim()}|${cartKey}`;
  const totalsAreCurrent = Boolean(totals && previewedKey === previewKey);
  const codAllowed = !totals || totals.shippingMethod === "LOCAL";
  const paymentMethods = ([
    onlineEnabled && { id: "ONLINE" as const, label: "پرداخت آنلاین", desc: "انتقال امن به درگاه زرینپال" },
    c2cConfigured && { id: "CARD_TO_CARD" as const, label: "کارت به کارت", desc: "واریز و ارسال تصویر رسید" },
    { id: "COD" as const, label: "پرداخت هنگام تحویل", desc: "برای ارسال درونشهری کرمان" },
  ].filter(Boolean) as Array<{ id: "ONLINE" | "CARD_TO_CARD" | "COD"; label: string; desc: string }>).filter((method) => method.id !== "COD" || codAllowed);
  const paymentAvailable = paymentMethods.some((method) => method.id === paymentMethod);
  const canPlaceOrder = totalsAreCurrent && !previewBusy && paymentAvailable;

  useEffect(() => {
    const requestId = ++previewRequestRef.current;
    if (!addressComplete) {
      setTotals(null);
      setPreviewedKey(null);
      setPreviewBusy(false);
      return;
    }
    if (previewedKey === previewKey) return;
    setTotals(null);
    setPreviewedKey(null);
    setPreviewBusy(true);
    setError(null);
    void previewTotals(requestId);
    // previewTotals intentionally reads the current validated address/cart snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, addressComplete]);

  async function previewTotals(requestId = ++previewRequestRef.current) {
    if (!cartData || !addressComplete) return;
    setPreviewBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/checkout/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: { recipientName, recipientPhone, province, city, addressLine, postalCode },
          items: cartData.lines.map((line) => ({ variantId: line.variantId, qty: line.qty })),
          couponCode: coupon.trim() || undefined,
        }),
      });
      const json = await response.json();
      if (requestId !== previewRequestRef.current) return;
      if (!response.ok) {
        setError(json.error ?? "محاسبه سفارش انجام نشد.");
        return;
      }
      setTotals(json.totals);
      setPreviewedKey(previewKey);
      if (coupon.trim() && json.totals?.couponError) setCouponMsg({ kind: "error", text: json.totals.couponError });
      else if (coupon.trim() && json.totals?.discountAmount > 0) setCouponMsg({ kind: "ok", text: `کد تخفیف اعمال شد — ${new Intl.NumberFormat("fa-IR").format(json.totals.discountAmount)} تومان تخفیف` });
      else if (coupon.trim()) setCouponMsg({ kind: "error", text: "کد تخفیف معتبر نیست." });
      else setCouponMsg(null);
    } catch {
      if (requestId === previewRequestRef.current) setError("خطای شبکه هنگام محاسبه سفارش رخ داد.");
    } finally {
      if (requestId === previewRequestRef.current) setPreviewBusy(false);
    }
  }

  async function placeOrder() {
    if (!cartData || !canPlaceOrder || placing) return;
    setPlacing(true);
    setError(null);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: { recipientName, recipientPhone, province, city, addressLine, postalCode },
          items: cartData.lines.map((line) => ({ variantId: line.variantId, qty: line.qty })),
          paymentMethod,
          couponCode: coupon || undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setShowOtp(true);
          return;
        }
        setError(json.error ?? "خطا در ثبت سفارش.");
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
        router.push(`/order/${json.order.orderNumber}?payment=${paymentMethod === "COD" ? "cod" : "c2c"}`);
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

  return (
    <div className="checkout-mobile-surface mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <PageHeader title="تسویه حساب" description="آدرس، روش ارسال و پرداخت را مرور کنید؛ مبلغ نهایی پیش از ثبت سفارش نمایش داده می‌شود." />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <CheckoutSection step="۱" title="آدرس گیرنده" description="اطلاعات باید دقیقاً با نشانی تحویل مطابقت داشته باشد.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="نام گیرنده" htmlFor="recipient-name">
                <input id="recipient-name" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} className={inputCls} placeholder="نام و نام خانوادگی" autoComplete="name" />
              </Field>
              <Field label="شماره موبایل" htmlFor="recipient-phone">
                <input id="recipient-phone" value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value.replace(/\D/g, "").slice(0, 11))} className={inputCls} placeholder="09xxxxxxxxx" dir="ltr" inputMode="numeric" autoComplete="tel" />
              </Field>
              <Field label="استان" htmlFor="province">
                <select id="province" value={province} onChange={(event) => { setProvince(event.target.value); setCity(""); }} className={inputCls} autoComplete="address-level1">
                  <option value="">انتخاب استان</option>
                  {iranProvinces.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
                </select>
              </Field>
              <Field label="شهر" htmlFor="city">
                <select id="city" value={city} onChange={(event) => setCity(event.target.value)} className={inputCls} disabled={!province} autoComplete="address-level2">
                  <option value="">{province ? "انتخاب شهر" : "ابتدا استان را انتخاب کنید"}</option>
                  {cities.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
                </select>
              </Field>
              <Field label="کد پستی" htmlFor="postal-code">
                <input id="postal-code" value={postalCode} onChange={(event) => setPostalCode(event.target.value.replace(/\D/g, "").slice(0, 10))} className={inputCls} placeholder="۱۰ رقم" dir="ltr" inputMode="numeric" autoComplete="postal-code" />
              </Field>
              <div className="md:col-span-2">
                <Field label="آدرس کامل" htmlFor="address-line">
                  <textarea id="address-line" value={addressLine} onChange={(event) => setAddressLine(event.target.value)} className={`${inputCls} min-h-24 resize-y`} rows={2} placeholder="خیابان، کوچه، پلاک، واحد" autoComplete="street-address" />
                </Field>
              </div>
            </div>
          </CheckoutSection>

          <CheckoutSection step="۲" title="روش ارسال" description="روش ارسال پس از تکمیل آدرس به‌صورت خودکار محاسبه می‌شود.">
            {totals ? (
              <div className="flex items-center justify-between gap-4 rounded-card bg-flame-50 px-4 py-4">
                <div>
                  <div className="text-sm font-bold text-flame-900">{methodLabel}</div>
                  <div className="mt-1 text-xs leading-6 text-flame-800/75">{totals.shippingNote || "هزینه ارسال بر اساس مقصد و وزن سفارش محاسبه شده است."}</div>
                </div>
                <div className="shrink-0 text-sm font-bold tabular-nums text-flame-900">{totals.freeDelivery ? "رایگان" : formatToman(totals.deliveryFee)}</div>
              </div>
            ) : (
              <div className="flex min-h-16 items-center gap-3 rounded-card bg-plaster px-4 text-sm text-ash">
                {previewBusy && <span className="size-4 animate-spin rounded-[30px] border-2 border-fog border-t-flame-700" aria-hidden />}
                {previewBusy ? "در حال محاسبه هزینه ارسال…" : addressComplete ? "در حال آماده‌سازی گزینه ارسال…" : "برای محاسبه ارسال، آدرس کامل را تکمیل کنید."}
              </div>
            )}
          </CheckoutSection>

          <CheckoutSection step="۳" title="روش پرداخت" description="یکی از روش‌های فعال فروشگاه را انتخاب کنید.">
            <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="روش پرداخت">
              {paymentMethods.map((method) => {
                const active = paymentMethod === method.id;
                return (
                  <button
                    key={method.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPaymentMethod(method.id)}
                    className={`min-h-28 rounded-card p-4 text-right transition ${active ? "bg-flame-50 ring-1 ring-flame-700" : "bg-canvas hover:bg-plaster"}`}
                  >
                    <span className="mb-4 flex size-5 items-center justify-center rounded-[30px] border border-fog" aria-hidden>
                      {active && <span className="size-2.5 rounded-[30px] bg-flame-700" />}
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
                   {paymentMethods.length > 0 ? "برای این مقصد، پرداخت هنگام تحویل در دسترس نیست؛ یکی از روش‌های فعال را انتخاب کنید." : "برای این سفارش هیچ روش پرداخت فعالی وجود ندارد."}
                 </StatusNotice>
               </div>
             )}
             {paymentMethod === "CARD_TO_CARD" && (
              <p className="mt-4 text-xs leading-6 text-ash">پس از ثبت سفارش، شماره کارت و مراحل ارسال رسید در صفحه سفارش نمایش داده می‌شود.</p>
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
                  <div className="mt-1 text-[11px] text-ash">{line.colorName} · {toFaDigits(line.qty)} عدد</div>
                </div>
                <div className="shrink-0 text-xs font-bold tabular-nums text-ink">{formatToman(line.lineTotal)}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-fog pt-5">
            <label htmlFor="coupon" className="text-xs font-bold text-ink">کد تخفیف</label>
            <div className="mt-2 flex gap-2">
              <input id="coupon" value={coupon} onChange={(event) => { setCoupon(event.target.value); setCouponMsg(null); }} className={inputCls} placeholder="مثلاً WELCOME" dir="ltr" />
              <Button variant="outline" onPress={() => void previewTotals()} isDisabled={previewBusy || !coupon.trim() || !addressComplete} className="shrink-0">اعمال</Button>
            </div>
            {couponMsg && <p className={`mt-2 text-xs leading-5 ${couponMsg.kind === "error" ? "text-red-700" : "text-emerald-700"}`}>{couponMsg.text}</p>}
          </div>

          <div className="mt-5 space-y-2.5 border-t border-fog pt-5 text-sm">
            <div className="flex justify-between gap-3"><span className="text-ash">جمع کالاها</span><span className="font-semibold tabular-nums text-ink">{formatToman(cartData.subtotal)}</span></div>
            {totals?.discountAmount ? <div className="flex justify-between gap-3 text-emerald-700"><span>تخفیف</span><span className="tabular-nums">− {formatToman(totals.discountAmount)}</span></div> : null}
            {totals && <div className="flex justify-between gap-3"><span className="text-ash">ارسال</span><span className="font-semibold tabular-nums text-ink">{totals.freeDelivery ? "رایگان" : formatToman(totals.deliveryFee)}</span></div>}
          </div>

          <div className="mt-5 flex items-end justify-between gap-3 border-t border-fog pt-5">
            <span className="font-bold text-ink">مبلغ نهایی</span>
            <span className="font-display text-xl font-black tabular-nums text-ink">{totals ? formatToman(totals.total) : "—"}</span>
          </div>

          {error && <div className="mt-4"><StatusNotice tone="danger" role="alert">{error}</StatusNotice></div>}

          <Button onPress={() => void placeOrder()} isDisabled={!canPlaceOrder || placing} className="mt-5 min-h-12 w-full" variant="primary">
            {placing ? "در حال ثبت سفارش…" : "ثبت نهایی سفارش"}
          </Button>
          <p className="mt-3 text-center text-[11px] leading-5 text-ash">با ثبت سفارش، نشانی و روش پرداخت انتخاب‌شده نهایی می‌شود.</p>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-plaster bg-canvas/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(17,17,17,0.08)] backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-ash">مبلغ نهایی</div>
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

const inputCls = "min-h-11 w-full rounded-card border border-fog bg-canvas px-3 py-2 text-sm text-ink outline-none transition placeholder:text-slate-line focus:border-flame-700 focus:ring-2 focus:ring-flame-100 disabled:cursor-not-allowed disabled:bg-plaster disabled:text-ash";

function CheckoutSection({ step, title, description, children }: { step: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card bg-canvas p-5 shadow-[var(--surface-shadow)] sm:p-6">
      <div className="mb-5 flex items-start gap-3 border-b border-plaster pb-4">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[30px] bg-flame-700 text-xs font-bold text-white" aria-hidden>{step}</span>
        <div>
          <h2 className="font-display text-lg font-black text-ink">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-ash">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold text-ink">
        {label}
        {hint && <span className="font-normal text-ash">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/cart-provider";
import { iranProvinces, iranCities, formatToman, toFaDigits } from "@kmodern/schema";
import OtpModal from "@/components/otp-modal";

interface Totals {
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  total: number;
  freeDelivery: boolean;
  shippingMethod: "LOCAL" | "POST" | "BARBERI";
  shippingNote?: string;
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

export default function CheckoutPage() {
  const { lines, clear } = useCart();
  const router = useRouter();

  const [cartData, setCartData] = useState<{ lines: Line[]; subtotal: number } | null>(null);
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"ONLINE" | "CARD_TO_CARD" | "COD">("ONLINE");
  const [coupon, setCoupon] = useState("");
  const [totals, setTotals] = useState<Totals | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOtp, setShowOtp] = useState(false);

  const cities = useMemo(() => (province ? iranCities.filter((c) => c.provinceId === iranProvinces.find((p) => p.name === province)?.id) : []), [province]);

  useEffect(() => {
    if (lines.length === 0) return;
    fetch("/api/cart/enrich", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(lines) })
      .then((r) => r.json())
      .then(setCartData);
  }, [lines]);

  const canPreview = recipientName && recipientPhone && province && city && addressLine && postalCode && cartData?.lines.length;

  async function previewTotals() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/checkout/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: { recipientName, recipientPhone, province, city, addressLine, postalCode },
          items: cartData!.lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
          couponCode: coupon || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "خطا"); return; }
      setTotals(j.totals);
    } catch {
      setError("خطای شبکه");
    } finally {
      setBusy(false);
    }
  }

  async function placeOrder() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: { recipientName, recipientPhone, province, city, addressLine, postalCode },
          items: cartData!.lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
          paymentMethod,
          couponCode: coupon || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        if (r.status === 401) { setShowOtp(true); return; }
        setError(j.error ?? "خطا در ثبت سفارش");
        return;
      }
      clear();
      if (paymentMethod === "ONLINE") {
        // start payment
        const pay = await fetch(`/api/orders/${j.order.id}/pay`, { method: "POST" });
        const pj = await pay.json();
        if (pay.ok && pj.url) { router.push(pj.url); return; }
        router.push(`/order/${j.order.orderNumber}?payment=pending`);
      } else {
        router.push(`/order/${j.order.orderNumber}?payment=${paymentMethod === "COD" ? "cod" : "c2c"}`);
      }
    } catch {
      setError("خطای شبکه");
    } finally {
      setBusy(false);
    }
  }

  if (!cartData || cartData.lines.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">تسویه حساب</h1>
        <p className="mt-4 text-ash">سبد شما خالی است.</p>
      </div>
    );
  }

  const methodLabel = { LOCAL: "ارسال درونشهری کرمان", POST: "پست پیشتاز", BARBERI: "باربری" }[totals?.shippingMethod ?? "BARBERI"];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-8 text-2xl font-bold">تسویه حساب</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* address */}
          <section className="rounded-2xl border border-plaster bg-white p-5">
            <h2 className="mb-4 font-extrabold text-ink"><span className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-[30px] bg-flame-700 text-sm text-white">۱</span>آدرس گیرنده</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="نام گیرنده"><input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className={inputCls} placeholder="نام و نام خانوادگی" /></Field>
              <Field label="موبایل"><input value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} className={inputCls} placeholder="09xxxxxxxxx" dir="ltr" /></Field>
              <Field label="استان">
                <select value={province} onChange={(e) => { setProvince(e.target.value); setCity(""); }} className={inputCls}>
                  <option value="">انتخاب استان</option>
                  {iranProvinces.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="شهر">
                <select value={city} onChange={(e) => setCity(e.target.value)} className={inputCls}>
                  <option value="">انتخاب شهر</option>
                  {cities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="کد پستی"><input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className={inputCls} placeholder="۱۰ رقم" dir="ltr" maxLength={10} /></Field>
            </div>
            <Field label="آدرس کامل" wide>
              <textarea value={addressLine} onChange={(e) => setAddressLine(e.target.value)} className={inputCls} rows={2} placeholder="خیابان، کوچه، پلاک، واحد" />
            </Field>
          </section>

          {/* coupon */}
          <section className="flex gap-2 rounded-2xl border border-plaster bg-white p-4">
            <input value={coupon} onChange={(e) => setCoupon(e.target.value)} className={inputCls} placeholder="کد تخفیف" />
            <button onClick={previewTotals} disabled={busy} className="shrink-0 rounded-card bg-ink px-6 py-2 text-sm font-bold text-white transition hover:bg-graphite disabled:opacity-50">
              اعمال
            </button>
          </section>

          {/* payment method */}
          <section className="rounded-2xl border border-plaster bg-white p-5">
            <h2 className="mb-4 font-extrabold text-ink"><span className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-[30px] bg-flame-700 text-sm text-white">۲</span>روش پرداخت</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                { id: "ONLINE" as const, label: "پرداخت آنلاین", desc: "درگاه زرینپال" },
                { id: "CARD_TO_CARD" as const, label: "کارت به کارت", desc: "واریز + ارسال رسید" },
                { id: "COD" as const, label: "پرداخت هنگام تحویل", desc: "فقط ارسال درونشهری" },
              ].map((m) => (
                <button key={m.id} onClick={() => setPaymentMethod(m.id)} className={`rounded-xl border p-4 text-right transition ${paymentMethod === m.id ? "border-flame-700 bg-flame-50 ring-1 ring-flame-300" : "border-plaster hover:border-flame-300"}`}>
                  <div className="font-semibold text-ink">{m.label}</div>
                  <div className="mt-1 text-xs text-ash">{m.desc}</div>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* summary */}
        <aside className="h-fit space-y-4 self-start rounded-xl border border-plaster bg-canvas p-6">
          <h2 className="font-extrabold text-ink"><span className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-[30px] bg-flame-700 text-sm text-white">۳</span>خلاصه سفارش</h2>
          <div className="space-y-2 text-sm">
            {cartData.lines.map((l) => (
              <div key={l.variantId} className="flex justify-between gap-2">
                <span className="truncate">{l.productName} × {toFaDigits(l.qty)}</span>
                <span className="whitespace-nowrap">{formatToman(l.lineTotal)}</span>
              </div>
            ))}
          </div>
          <hr />
          <div className="flex justify-between"><span>جمع کالاها</span><span>{formatToman(cartData.subtotal)}</span></div>
          {totals && totals.discountAmount > 0 && (
            <div className="flex justify-between text-green-600"><span>تخفیف</span><span>− {formatToman(totals.discountAmount)}</span></div>
          )}
          {totals && (
            <div className="flex justify-between">
              <span>ارسال ({methodLabel})</span>
              <span>{totals.freeDelivery ? "رایگان" : formatToman(totals.deliveryFee)}</span>
            </div>
          )}
          {!totals && (
            <button onClick={previewTotals} disabled={!canPreview || busy} className="w-full rounded-card bg-plaster py-2.5 text-sm font-bold text-ink ring-1 ring-plaster transition hover:bg-plaster disabled:opacity-50">
              محاسبه هزینه ارسال
            </button>
          )}
          <hr />
          <div className="flex justify-between text-lg font-extrabold text-ink">
            <span>مبلغ قابل پرداخت</span>
            <span>{totals ? formatToman(totals.total) : "—"}</span>
          </div>
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
          <button
            onClick={placeOrder}
            disabled={!totals || busy}
            className="w-full whitespace-nowrap rounded-card bg-flame-700 py-3.5 font-extrabold text-white transition hover:bg-flame-600 disabled:cursor-not-allowed disabled:bg-fog disabled:text-ash"
          >
            {busy ? "در حال ثبت…" : "ثبت نهایی سفارش"}
          </button>
        </aside>
      </div>

      {showOtp && (
        <OtpModal
          phone={recipientPhone}
          onSuccess={() => {
            setShowOtp(false);
            // retry the order now that a session exists
            void (async () => {
              try {
                const r = await fetch("/api/checkout", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    address: { recipientName, recipientPhone, province, city, addressLine, postalCode },
                    items: cartData!.lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
                    paymentMethod,
                    couponCode: coupon || undefined,
                  }),
                });
                const j = await r.json();
                if (!r.ok) { setError(j.error ?? "خطا در ثبت سفارش"); return; }
                clear();
                if (paymentMethod === "ONLINE") {
                  const pay = await fetch(`/api/orders/${j.order.id}/pay`, { method: "POST" });
                  const pj = await pay.json();
                  if (pay.ok && pj.url) { router.push(pj.url); return; }
                  router.push(`/order/${j.order.orderNumber}?payment=pending`);
                } else {
                  router.push(`/order/${j.order.orderNumber}?payment=${paymentMethod === "COD" ? "cod" : "c2c"}`);
                }
              } catch {
                setError("خطای شبکه");
              }
            })();
          }}
        />
      )}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-fog px-3 py-2 text-sm outline-none transition focus:border-flame-700 focus:ring-2 focus:ring-flame-200";

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "col-span-full block" : "block"}>
      <span className="mb-1 block text-sm text-ash">{label}</span>
      {children}
    </label>
  );
}
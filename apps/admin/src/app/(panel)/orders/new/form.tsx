"use client";

// Manual order entry (009). Admin picks a customer, adds line items, sets
// payment/shipping, and the server creates the order with a per-year number,
// reserving (or committing, for COD) stock exactly like the storefront.

import { useActionState, useMemo, useState } from "react";
import { createManualOrder } from "@/lib/actions/orders";
import type { ActionState } from "@/lib/actions/auth";
import { Button, Card, CardBody, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { formatToman } from "@kmodern/schema/format";

interface CustomerLite {
  id: string;
  name: string | null;
  phone: string;
}
interface VariantLite {
  id: string;
  sku: string;
  colorName: string;
  price: number;
  stock: number;
  product: { name: string };
}

export function ManualOrderForm({ customers, variants }: { customers: CustomerLite[]; variants: VariantLite[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createManualOrder, {});
  const [lines, setLines] = useState<Array<{ variantId: string; qty: number }>>([]);
  const [address, setAddress] = useState({
    recipientName: "",
    recipientPhone: "",
    province: "",
    city: "",
    addressLine: "",
    postalCode: "",
  });
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [deliveryFeeMode, setDeliveryFeeMode] = useState("FLAT");

  const variantById = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);
  const subtotal = lines.reduce((s, l) => s + (variantById.get(l.variantId)?.price ?? 0) * l.qty, 0);
  const total = subtotal + (deliveryFeeMode === "FREE" ? 0 : (Number(deliveryFee) || 0));

  const addLine = () => {
    if (!variants.length) return;
    const used = new Set(lines.map((line) => line.variantId));
    const next = variants.find((variant) => !used.has(variant.id));
    if (next) setLines((ls) => [...ls, { variantId: next.id, qty: 1 }]);
  };
  const updateLine = (i: number, patch: Partial<{ variantId: string; qty: number }>) => {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  return (
    <form action={formAction} className="space-y-5">
      <Card>
        <CardHeader title="مشتری و ارسال" />
        <CardBody>
          <Field label="مشتری" required>
            <select name="customerId" className="w-full rounded-card border border-fog px-3 py-2 text-sm" defaultValue="" required>
              <option value="" disabled>انتخاب مشتری…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name || c.phone} ({c.phone})</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="نام گیرنده" required><Input name="address.recipientName" value={address.recipientName} onChange={(e) => setAddress({ ...address, recipientName: e.target.value })} required /></Field>
            <Field label="موبایل گیرنده" required><Input name="address.recipientPhone" dir="ltr" inputMode="tel" pattern="09[0-9]{9}" value={address.recipientPhone} onChange={(e) => setAddress({ ...address, recipientPhone: e.target.value })} required /></Field>
            <Field label="استان" required><Input name="address.province" value={address.province} onChange={(e) => setAddress({ ...address, province: e.target.value })} required /></Field>
            <Field label="شهر" required><Input name="address.city" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} required /></Field>
            <div className="md:col-span-2">
              <Field label="آدرس" required><Textarea name="address.addressLine" value={address.addressLine} onChange={(e) => setAddress({ ...address, addressLine: e.target.value })} required minLength={5} /></Field>
            </div>
            <Field label="کد پستی" required><Input name="address.postalCode" dir="ltr" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={address.postalCode} onChange={(e) => setAddress({ ...address, postalCode: e.target.value })} required /></Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="اقلام" />
        <CardBody>
          <div className="space-y-2">
            {lines.map((l, i) => {
              const v = variantById.get(l.variantId);
              return (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-card border border-plaster p-2">
                  <select
                    className="min-w-56 flex-1 rounded-card border border-fog px-3 py-2 text-sm"
                    aria-label={`انتخاب تنوع ردیف ${i + 1}`}
                    value={l.variantId}
                    onChange={(e) => updateLine(i, { variantId: e.target.value })}
                  >
                    {variants.map((vv) => (
                      <option key={vv.id} value={vv.id}>
                        {vv.product.name} — {vv.colorName || vv.sku} ({formatToman(vv.price)})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number" min={1} aria-label={`تعداد ردیف ${i + 1}`} className="w-20 rounded-card border border-fog px-2 py-2 text-sm"
                    value={l.qty} onChange={(e) => updateLine(i, { qty: Number(e.target.value) || 1 })}
                  />
                  <span className="text-sm text-ash">{v ? formatToman(v.price * l.qty) : ""}</span>
                  <button type="button" onClick={() => removeLine(i)} className="rounded-card px-2 py-1 text-sm text-red-700 hover:bg-red-50">حذف</button>
                </div>
              );
            })}
            <Button type="button" variant="secondary" onClick={addLine}>+ افزودن قلم</Button>
          </div>
          <input type="hidden" name="items" value={JSON.stringify(lines)} />
          <div className="mt-4 flex justify-end gap-6 border-t border-plaster pt-4 text-sm">
            <span>جمع کالا: <b>{formatToman(subtotal)}</b></span>
            <span>قابل پرداخت: <b>{formatToman(total)}</b></span>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="پرداخت و ارسال" />
        <CardBody>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="روش پرداخت" required>
              <select name="paymentMethod" className="w-full rounded-card border border-fog px-3 py-2 text-sm" defaultValue="CARD_TO_CARD">
                <option value="ONLINE">آنلاین (زرین‌پال)</option>
                <option value="CARD_TO_CARD">کارت به کارت</option>
                <option value="COD">پس کرایه</option>
              </select>
            </Field>
            <Field label="روش ارسال" required>
              <select name="shippingMethod" className="w-full rounded-card border border-fog px-3 py-2 text-sm" defaultValue="LOCAL">
                <option value="LOCAL">ارسال محلی</option>
                <option value="POST">پست</option>
                <option value="BARBERI">باربری</option>
              </select>
            </Field>
            <Field label="نحوه دریافت هزینه ارسال">
              <select name="deliveryFeeMode" value={deliveryFeeMode} onChange={(e) => setDeliveryFeeMode(e.target.value)} className="w-full rounded-card border border-fog px-3 py-2 text-sm">
                <option value="FREE">رایگان</option>
                <option value="FLAT">مبلغ ثابت</option>
                <option value="API_QUOTE">استعلام آنلاین</option>
                <option value="FALLBACK_FLAT">مبلغ جایگزین</option>
                <option value="FREIGHT_COLLECT">پس کرایه</option>
              </select>
            </Field>
            <Field label="هزینه ارسال (تومان)">
              <Input name="deliveryFee" dir="ltr" type="number" min={0} disabled={deliveryFeeMode === "FREE"} value={deliveryFeeMode === "FREE" ? "0" : deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} />
            </Field>
            <div className="md:col-span-2">
              <Field label="یادداشت ادمین"><Textarea name="adminNote" /></Field>
            </div>
          </div>
          {state.error && <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>{pending ? "در حال ثبت…" : "ثبت سفارش"}</Button>
          </div>
        </CardBody>
      </Card>
    </form>
  );
}
"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveDiscount } from "@/lib/actions/settings";
import type { ActionState } from "@/lib/actions/auth";
import { Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Select } from "@/components/ui";

export interface DiscountSeed {
  id?: string;
  type: "PERCENT" | "FIXED" | "FREE_DELIVERY";
  scope: "ALL" | "PRODUCTS" | "CATEGORIES" | "COLLECTIONS";
  mode: "COUPON" | "AUTOMATIC";
  code: string;
  value: number;
  maxAmount: number | null;
  productIds: string[];
  categoryIds: string[];
  collectionIds: string[];
  startsAt: string;
  endsAt: string;
  minOrderSubtotal: number | null;
  maxUsesTotal: number | null;
  maxUsesPerCustomer: number | null;
  status: "ACTIVE" | "DISABLED";
}

export function DiscountForm({ seed }: { seed: DiscountSeed }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveDiscount, {});
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const [d, setD] = useState(seed);
  const set = (patch: Partial<DiscountSeed>) => setD((x) => ({ ...x, ...patch }));

  const payload = JSON.stringify({
    ...d,
    productIds: d.productIds,
    categoryIds: d.categoryIds,
    collectionIds: d.collectionIds,
    value: Number(d.value) || 0,
    maxAmount: d.maxAmount === null ? undefined : Number(d.maxAmount) || 0,
    minOrderSubtotal: d.minOrderSubtotal === null ? undefined : Number(d.minOrderSubtotal) || 0,
    maxUsesTotal: d.maxUsesTotal === null ? undefined : Number(d.maxUsesTotal) || 0,
    maxUsesPerCustomer: d.maxUsesPerCustomer === null ? undefined : Number(d.maxUsesPerCustomer) || 0,
  });

  return (
    <form action={formAction} className="mx-auto max-w-3xl space-y-5">
      <input type="hidden" name="id" value={d.id ?? ""} />
      <input type="hidden" name="payload" value={payload} />

      <Card>
        <CardHeader title="مشخصات تخفیف" />
        <CardBody>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="نوع تخفیف" required>
              <Select value={d.type} onChange={(e) => set({ type: e.target.value as DiscountSeed["type"] })}>
                <option value="PERCENT">درصدی</option>
                <option value="FIXED">مبلغ ثابت (تومان)</option>
                <option value="FREE_DELIVERY">ارسال رایگان</option>
              </Select>
            </Field>
            <Field label="حالت" required>
              <Select value={d.mode} onChange={(e) => set({ mode: e.target.value as DiscountSeed["mode"] })}>
                <option value="COUPON">کوپن (کد اختصاصی)</option>
                <option value="AUTOMATIC">خودکار (بدون کد)</option>
              </Select>
            </Field>
            {d.mode === "COUPON" && (
              <Field label="کد کوپن" required>
                <Input dir="ltr" value={d.code} onChange={(e) => set({ code: e.target.value })} placeholder="SAVE10" />
              </Field>
            )}
            <Field label={d.type === "PERCENT" ? "درصد تخفیف" : "مبلغ (تومان)"}>
              <Input type="number" dir="ltr" value={d.value} onChange={(e) => set({ value: Number(e.target.value) })} />
            </Field>
            <Field label="سقف تخفیف (درصدی، اختیاری)">
              <Input type="number" dir="ltr" value={d.maxAmount ?? ""} onChange={(e) => set({ maxAmount: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            <Field label="دامنه" required>
              <Select value={d.scope} onChange={(e) => set({ scope: e.target.value as DiscountSeed["scope"] })}>
                <option value="ALL">کل سبد خرید</option>
                <option value="PRODUCTS">محصولات خاص</option>
                <option value="CATEGORIES">دسته‌ها</option>
                <option value="COLLECTIONS">مجموعه‌ها</option>
              </Select>
            </Field>
            {d.scope === "PRODUCTS" && (
              <Field label="شناسه محصولات (با کاما)">
                <Input dir="ltr" value={d.productIds.join(",")} onChange={(e) => set({ productIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </Field>
            )}
            {d.scope === "CATEGORIES" && (
              <Field label="شناسه دسته‌ها (با کاما)">
                <Input dir="ltr" value={d.categoryIds.join(",")} onChange={(e) => set({ categoryIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </Field>
            )}
            {d.scope === "COLLECTIONS" && (
              <Field label="شناسه مجموعه‌ها (با کاما)">
                <Input dir="ltr" value={d.collectionIds.join(",")} onChange={(e) => set({ collectionIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </Field>
            )}
            <Field label="شروع" required>
              <Input type="datetime-local" dir="ltr" value={d.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
            </Field>
            <Field label="پایان (اختیاری)">
              <Input type="datetime-local" dir="ltr" value={d.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
            </Field>
            <Field label="حداقل مبلغ سبد (اختیاری)">
              <Input type="number" dir="ltr" value={d.minOrderSubtotal ?? ""} onChange={(e) => set({ minOrderSubtotal: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            <Field label="سقف استفاده کل (اختیاری)">
              <Input type="number" dir="ltr" value={d.maxUsesTotal ?? ""} onChange={(e) => set({ maxUsesTotal: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            <Field label="سقف استفاده هر مشتری (اختیاری)">
              <Input type="number" dir="ltr" value={d.maxUsesPerCustomer ?? ""} onChange={(e) => set({ maxUsesPerCustomer: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            <Field label="وضعیت">
              <Select value={d.status} onChange={(e) => set({ status: e.target.value as DiscountSeed["status"] })}>
                <option value="ACTIVE">فعال</option>
                <option value="DISABLED">غیرفعال</option>
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.message}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? "در حال ذخیره…" : "ذخیره تخفیف"}</Button>
      </div>
    </form>
  );
}
"use client";

// Order status transition controls (009). Shows allowed next steps for the
// fulfillment and payment dimensions; each transition validates server-side,
// writes an OrderStatusEvent + stock side effect, and refreshes the page.

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setOrderStatus } from "@/lib/actions/orders";
import type { ActionState } from "@/lib/actions/auth";
import { STATUS_LABELS } from "@/components/status";
import { Button, Input, Select, Spinner, Textarea } from "@/components/ui";

const FULFILLMENT_NEXT: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  CANCELLED: [],
  RETURNED: [],
};

const PAYMENT_NEXT: Record<string, string[]> = {
  AWAITING: ["PAID", "FAILED"],
  PAID: ["REFUNDED"],
  FAILED: ["AWAITING"],
  REFUNDED: [],
};

export function OrderStatusTransitions({
  orderId,
  fulfilled,
  paid,
}: {
  orderId: string;
  fulfilled: string;
  paid: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setOrderStatus, {});
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">وضعیت اجرا (فعلی: {STATUS_LABELS[fulfilled] ?? fulfilled})</h3>
        <form action={formAction} className="space-y-2" onSubmit={(event) => {
          const target = String(new FormData(event.currentTarget).get("to") ?? "");
          if (["CANCELLED", "RETURNED", "REFUNDED"].includes(target) && !window.confirm("این عملیات وضعیت سفارش و موجودی را تغییر می‌دهد. ادامه می‌دهید؟")) event.preventDefault();
        }}>
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="dimension" value="FULFILLMENT" />
          {FULFILLMENT_NEXT[fulfilled]?.length ? (
            <>
              <Select name="to" defaultValue={FULFILLMENT_NEXT[fulfilled][0]}>
                {FULFILLMENT_NEXT[fulfilled].map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                ))}
              </Select>
              <Input name="note" placeholder="توضیح (اختیاری)" />
              <Button type="submit" variant="secondary" disabled={pending} className="w-full">
                {pending ? <Spinner /> : "ثبت تغییر وضعیت"}
              </Button>
            </>
          ) : (
            <p className="text-sm text-ash">این وضعیت پایانی است.</p>
          )}
        </form>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">وضعیت پرداخت (فعلی: {STATUS_LABELS[paid] ?? paid})</h3>
        <form action={formAction} className="space-y-2" onSubmit={(event) => {
          const target = String(new FormData(event.currentTarget).get("to") ?? "");
          if (["CANCELLED", "RETURNED", "REFUNDED"].includes(target) && !window.confirm("این عملیات وضعیت سفارش و موجودی را تغییر می‌دهد. ادامه می‌دهید؟")) event.preventDefault();
        }}>
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="dimension" value="PAYMENT" />
          {PAYMENT_NEXT[paid]?.length ? (
            <>
              <Select name="to" defaultValue={PAYMENT_NEXT[paid][0]}>
                {PAYMENT_NEXT[paid].map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                ))}
              </Select>
              <Textarea name="note" placeholder="توضیح (اختیاری)" className="min-h-[38px]" />
              <Button type="submit" variant="secondary" disabled={pending} className="w-full">
                {pending ? <Spinner /> : "ثبت تغییر پرداخت"}
              </Button>
            </>
          ) : (
            <p className="text-sm text-ash">کمپایانی در پرداخت.</p>
          )}
        </form>
      </div>

      {state.error && <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && <p role="status" aria-live="polite" className="rounded-card bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.message}</p>}
    </div>
  );
}
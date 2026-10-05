"use client";

// Order status transition controls (009).
//
// The allowed next steps arrive as props from the page, which read them from the gateway. This
// component used to carry two byte-identical copies of the transition tables — the same ones the
// server enforced — and render its `<Select>` from them. That is the drift ticket 12 exists to close:
// a form that offers what it thinks the server accepts, checked against a table nobody re-reads when
// the server's changes.
//
// So there is no rule in this file. It renders the two lists it is given, and submits one. A status
// with an empty list is a terminal one, which is the server's statement rather than a local guess —
// and the gateway's `transitionsFor` returns an empty array precisely so this reads as "finished"
// rather than as "nothing loaded".

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { STATUS_LABELS } from "@/components/status";
import { Button, Input, Textarea } from "@kmodern/ui";
import { Select, Spinner } from "@/components/panel-ui";
import { setOrderStatusAction } from "@/orders/lib/orders";
import type { OrderTransitions } from "@/orders/lib/order-status";
import { idle, type ActionResult } from "@/lib/actions/result";
// The shape of what the gateway will accept, declared once in the feature that asks it for them. It
// was also declared here, as `AllowedTransitions` — the same two arrays under a second name — and a
// third time inline on the page that reads the order. Three declarations of one answer is three
// places for the gateway's shape to be restated wrong, and the component's copy was the dangerous
// one: it is the thing that decides what a `<Select>` offers.

export function OrderStatusTransitions({
  orderId,
  fulfilled,
  paid,
  allowed,
}: {
  orderId: string;
  fulfilled: string;
  paid: string;
  allowed: OrderTransitions;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(setOrderStatusAction, idle);
  const router = useRouter();
  useEffect(() => {
    // `ok` with an empty message is the idle state, not a success to refresh for. Without this the
    // page would re-render on mount, which is the same bug as refreshing in a loop.
    if (state.ok && state.message) router.refresh();
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
          {allowed.fulfillment.length ? (
            <>
              <Select name="to" defaultValue={allowed.fulfillment[0]}>
                {allowed.fulfillment.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                ))}
              </Select>
              <Input name="note" placeholder="توضیح (اختیاری)" />
              <Button type="submit" variant="outline" disabled={pending} className="w-full">
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
          {allowed.payment.length ? (
            <>
              <Select name="to" defaultValue={allowed.payment[0]}>
                {allowed.payment.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                ))}
              </Select>
              <Textarea name="note" placeholder="توضیح (اختیاری)" className="min-h-[38px]" />
              <Button type="submit" variant="outline" disabled={pending} className="w-full">
                {pending ? <Spinner /> : "ثبت تغییر پرداخت"}
              </Button>
            </>
          ) : (
            <p className="text-sm text-ash">کمپایانی در پرداخت.</p>
          )}
        </form>
      </div>

      {!state.ok && state.error && <p role="alert" className="notice-error">{state.error}</p>}
      {state.ok && state.message && <p role="status" aria-live="polite" className="notice-success">{state.message}</p>}
    </div>
  );
}

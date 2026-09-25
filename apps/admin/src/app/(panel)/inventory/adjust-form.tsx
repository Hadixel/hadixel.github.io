"use client";

// Per-variant stock adjust (delta + note) — writes through adjustStock with
// audit (017 inventory queue).

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adjustStock } from "@/lib/actions/orders";
import type { ActionState } from "@/lib/actions/auth";
import { Button } from "@/components/ui";

export function AdjustStockRow({ variantId }: { variantId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(adjustStock, {});
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="variantId" value={variantId} />
      <input
        type="number"
        aria-label="مقدار تغییر موجودی"
        name="delta"
        required
        placeholder="+/−"
        className="w-16 rounded-card border border-fog px-2 py-1 text-sm"
        dir="ltr"
      />
      <input
        type="text"
        aria-label="یادداشت تعدیل موجودی"
        name="note"
        placeholder="یادداشت"
        className="w-24 rounded-card border border-fog px-2 py-1 text-sm"
      />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>ثبت</Button>
      {state.error && <span role="alert" className="text-xs text-red-700">{state.error}</span>}
      {state.ok && <span className="text-xs text-emerald-600">✓</span>}
    </form>
  );
}
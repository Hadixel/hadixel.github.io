"use client";

// Per-variant stock adjust (delta + note) — writes through adjustStock with
// audit (017 inventory queue).

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adjustStock } from "@/lib/actions/orders";
import { idle, type ActionResult } from "@/lib/actions/result";
import { Button } from "@/components/ui";

export function AdjustStockRow({ variantId }: { variantId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(adjustStock, idle);
  const router = useRouter();
  useEffect(() => {
    // Only a real success refreshes. `idle` is `ok` with an empty message, and refreshing for that
    // would re-render the page on mount.
    if (state.ok && state.message) router.refresh();
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
      {!state.ok && state.error && <span role="alert" className="text-xs text-red-700">{state.error}</span>}
      {state.ok && state.message && <span className="text-xs text-emerald-600">✓</span>}
    </form>
  );
}
"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { deleteDiscount } from "@/lib/actions/discount-actions";
import { idle, type ActionResult } from "@/lib/actions/result";
import { Button } from "@/components/ui";

export function DeleteDiscountButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(deleteDiscount, idle);
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  return (
    <form action={formAction} onSubmit={(e) => { if (!confirm("حذف این تخفیف؟")) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="danger" size="sm" disabled={pending}>حذف</Button>
      {!state.ok && <span role="alert" className="mr-2 text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
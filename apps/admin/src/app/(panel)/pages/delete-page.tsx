"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { deletePageAction } from "@/lib/actions/content";
import type { ActionState } from "@/lib/actions/auth";
import { Button } from "@/components/ui";

export function DeletePageButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(deletePageAction, {});
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  return (
    <form action={formAction} onSubmit={(e) => { if (!confirm("حذف این صفحه؟")) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="danger" size="sm" disabled={pending}>حذف</Button>
      {state.error && <span className="mr-2 text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
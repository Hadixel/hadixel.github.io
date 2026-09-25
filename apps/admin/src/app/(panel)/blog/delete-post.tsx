"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { deletePostAction } from "@/lib/actions/content";
import type { ActionState } from "@/lib/actions/auth";
import { Button } from "@/components/ui";

export function DeletePostButton({ id, title }: { id: string; title: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(deletePostAction, {});
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(`حذف نوشته «${title}»؟`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="danger" size="sm" disabled={pending}>حذف</Button>
      {state.error && <span role="alert" className="mr-2 text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
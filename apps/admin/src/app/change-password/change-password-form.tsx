"use client";

import { useActionState } from "react";
import { changePasswordAction, type ActionState } from "@/lib/actions/auth";
import { Button, Card, CardBody, Field, Input } from "@/components/ui";

export function ChangePasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(changePasswordAction, {});

  return (
    <Card className="w-full max-w-sm">
      <CardBody>
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-slate-900">تغییر گذرواژه اجباری</h1>
          <p className="mt-1 text-sm text-slate-500" dir="ltr">{email}</p>
        </div>
        <form action={formAction} className="space-y-4">
          <Field label="گذرواژه فعلی" required>
            <Input type="password" name="current" dir="ltr" required />
          </Field>
          <Field label="گذرواژه جدید" required hint="حداقل ۱۲ کاراکتر" >
            <Input type="password" name="next" dir="ltr" required />
          </Field>
          <Field label="تکرار گذرواژه جدید" required>
            <Input type="password" name="confirm" dir="ltr" required />
          </Field>
          {state.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
          )}
          {state.ok && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.message}</p>
          )}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "در حال ذخیره…" : "تغییر گذرواژه"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
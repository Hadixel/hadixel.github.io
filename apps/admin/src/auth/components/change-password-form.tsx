"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/auth/lib/auth-actions";
import { type ActionState } from "@/lib/actions/result";
import { Button, Card, CardContent, Input } from "@kmodern/ui";
import { Field } from "@/components/panel-ui";

export function ChangePasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(changePasswordAction, {});

  return (
    <Card className="w-full max-w-sm">
      <CardContent>
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-ink">تغییر گذرواژه اجباری</h1>
          <p className="mt-1 text-sm text-ash" dir="ltr">{email}</p>
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
            <p role="alert" className="notice-error">{state.error}</p>
          )}
          {state.ok && (
            <p className="notice-success">{state.message}</p>
          )}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "در حال ذخیره…" : "تغییر گذرواژه"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
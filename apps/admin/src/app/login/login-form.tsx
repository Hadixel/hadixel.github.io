"use client";

// 010 login form. Client component over the server action so we can surface
// rate-limit / lockout errors inline.

import { useActionState } from "react";
import { loginAction, type ActionState } from "@/lib/actions/auth";
import { Button, Card, CardBody, Field, Input } from "@/components/ui";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(loginAction, {});

  return (
    <div className="w-full max-w-sm rounded-card border border-plaster bg-canvas p-8">
      
        <div className="mb-6 text-center">
          <h1 className="text-xl font-extrabold text-ink">کمدرن — <span className="text-flame-700">پنل مدیریت</span></h1>
          <p className="mt-1 text-sm text-ash">ورود به سامانه</p>
        </div>
        <form action={formAction} className="space-y-4">
          <Field label="ایمیل" required>
            <Input type="email" name="email" autoComplete="username" dir="ltr" required />
          </Field>
          <Field label="گذرواژه" required>
            <Input type="password" name="password" autoComplete="current-password" dir="ltr" required />
          </Field>
          {state.error && (
            <p className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
          )}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "در حال ورود…" : "ورود"}
          </Button>
        </form>
      
    </div>
  );
}
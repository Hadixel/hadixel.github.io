"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSettings } from "@/settings/lib/settings-actions";
// The gateway's definitions shape, declared once in the feature's lib. This file used to declare
// `FieldDef` and the section shape inline, which is the second copy of what the page declares — and
// the two are what the form is rendered from, so a disagreement between them is a wrong input.
import { type SettingSectionDef } from "@/settings/lib/settings";
import { idle, type ActionResult } from "@/lib/actions/result";
import { Button, Card, CardContent, CardHeader, Input } from "@kmodern/ui";
import { Field, Select } from "@/components/panel-ui";

export function SettingsForm({
  sections,
  initial,
}: {
  sections: Record<string, SettingSectionDef>;
  initial: Record<string, string>;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(saveSettings, idle);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const [section, setSection] = useState<string>(Object.keys(sections)[0]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const def = sections[section];

  const enumLabels: Record<string, string> = {
    FREE: "رایگان",
    FLAT: "کرایه ثابت",
    API_QUOTE: "استعلام آنلاین",
    FALLBACK_FLAT: "کرایه بازگشتی ثابت",
    FREIGHT_COLLECT: "پرداخت در مقصد",
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_1fr]">
      <nav aria-label="بخش‌های تنظیمات" className="space-y-1">
        {Object.entries(sections).map(([key, s]) => (
          <button
            key={key}
            type="button"
            aria-pressed={section === key}
            onClick={() => setSection(key)}
            className={`block w-full rounded-card px-3 py-2 text-right text-sm ${
              section === key ? "bg-ink font-medium text-white" : "text-ink hover:bg-plaster"
            }`}
          >
            <span className="ml-2">{s.icon}</span>
            {s.label}
          </button>
        ))}
      </nav>

      <form action={formAction}>
        <input type="hidden" name="section" value={section} />
        <Card>
          <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink">{def.label}</h2>
              <p className="mt-0.5 text-sm text-ash">{def.description}</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="form-grid">
              {def.fields.map((f) => (
                <Field key={f.key} label={f.label}>
                  {f.type === "enum" ? (
                    <Select name={f.key} value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}>
                      {f.enumValues?.map((ev) => (
                        <option key={ev} value={ev}>{enumLabels[ev] ?? ev}</option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      name={f.key}
                      type={f.type}
                      dir={fieldDirection(f)}
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    />
                  )}
                </Field>
              ))}
            </div>

            {/* Narrowed on `ok`, which is the point of the union: the old `ActionState` had four
                optional fields, so a failure with no message type-checked and showed an empty box. */}
            {!state.ok && <p role="alert" className="notice-error">{state.error}</p>}
            {state.ok && state.message !== "" && <p className="notice-success">{state.message}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>{pending ? "در حال ذخیره…" : "ذخیره تنظیمات"}</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
/**
 * Which way a field's text runs.
 *
 * This was a list of nine field names checked with `includes`, and the list had to be the *only* thing
 * standing between a number field and a Persian-numeral input rendered in an LTR context. Two ways that
 * goes wrong, both invisible: a new numeric setting is added to the shop and renders right-to-left
 * because nobody remembered this list, or a field is renamed in the definitions and quietly stops being
 * an LTR field.
 *
 * The type already says it. A `number` field holds a quantity, a fee or a weight — never Persian text —
 * so it runs left to right. A `text` field may hold either, and `auto` lets the browser decide from the
 * first strong character, which is what the shop's name and address fields need. The card number and
 * the alert mobile are `text` and read left to right, and they are the reason the list existed: they
 * are text that is not Persian. That is a property of the *value*, not of the type, so it is said where
 * a value can say it rather than as a list here.
 */
function fieldDirection(field: { key: string; type: string }): "ltr" | "auto" {
  if (field.type === "number") return "ltr";
  return LTR_TEXT_FIELDS.has(field.key) ? "ltr" : "auto";
}

/** The `text` fields whose values are never Persian: a card number, a phone number, a handle. */
const LTR_TEXT_FIELDS = new Set(["paymentC2cCardNumber", "adminAlertMobile"]);

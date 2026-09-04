"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSettings } from "@/lib/actions/settings";
import type { ActionState } from "@/lib/actions/auth";
import { Button, Card, CardBody, CardHeader, Field, Input, Select } from "@/components/ui";

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "enum";
  enumValues?: string[];
}

export function SettingsForm({
  sections,
  initial,
}: {
  sections: Record<string, { label: string; icon: string; description: string; fields: FieldDef[] }>;
  initial: Record<string, string>;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveSettings, {});
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
      <nav className="space-y-1">
        {Object.entries(sections).map(([key, s]) => (
          <button
            key={key}
            type="button"
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
          <CardHeader title={def.label} subtitle={def.description} />
          <CardBody>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                      dir={f.type === "text" ? undefined : "ltr"}
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    />
                  )}
                </Field>
              ))}
            </div>

            {state.error && <p className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
            {state.ok && <p className="rounded-card bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.message}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>{pending ? "در حال ذخیره…" : "ذخیره تنظیمات"}</Button>
            </div>
          </CardBody>
        </Card>
      </form>
    </div>
  );
}
// Settings, as a thin module over the gateway.
//
// This used to hold the panel's own table of settings — five sections, their fields, and each field's
// type — *and* the rules for what each value may be: not negative, whole numbers for three named
// keys, at least one for two of those, a member of a five-item enum for one, and a
// `/^09\d{9}$/` on the alert mobile. It upserted each row itself and wrote its audit line afterwards.
//
// Two of those were real defects rather than duplication:
//
//   - The audit line was written after the upserts, so a failure on the last field left the earlier
//     ones committed with no record of who changed them.
//   - `/^09\d{9}$/` refuses every spelling but the canonical one, so an operator typing
//     `+989121234567` — the same person — was told the number was invalid. The gateway normalises
//     with the same function the checkout uses for a shopper's number.
//
// What is left here is the translation, and it is one decision: **which fields the form actually
// sent.** An HTML form posts every input in the section, including the ones the operator left blank,
// and a blank is not a value — it is the absence of one, and the gateway must not be told to store
// `""` where a number is read. So a blank field is dropped here rather than sent.
//
// The rules themselves — what a value may be, which keys exist, how a field is rendered — are the
// gateway's, and `GET /settings/definitions` is what the settings page builds its form from. A second
// copy of the type table is a rule that can disagree with the first about what a field wants, and
// "unused" is not good enough: the page would still render an input from it.
//
// A plain module rather than a `"use server"` one, for the reason `category.ts` gives: the session
// check goes through `cookies()`, which throws outside a request scope, so it lives in the adapter.

import { field } from "./form-helpers";
import { fromGateway } from "@/lib/gateway";
import { failed, type ActionResult } from "./result";

/** What the gateway's `SaveSettingsDto` accepts. Mirrors it rather than importing it. */
interface SettingsBody {
  section: string;
  values: Record<string, string>;
}

/**
 * Save the section the operator was editing.
 *
 * The whole form is posted, not a diff, because a form cannot express "leave that one alone" — and it
 * must not try to, because an empty text field and an empty number field mean different things. The
 * gateway judges each value against the type it declared and drops a blank one, so the panel's only
 * job is to send what was typed.
 */
export async function saveSettingsRequest(formData: FormData): Promise<ActionResult> {
  const section = field(formData, "section");
  if (!section) return failed("بخش تنظیمات نامعتبر است");

  const values: Record<string, string> = {};
  for (const [key, entry] of formData.entries()) {
    // `section` is the form's own routing field, not a setting, and sending it as one would be a
    // field the gateway's table has never heard of.
    if (key === "section") continue;
    if (typeof entry !== "string") continue;
    values[key] = entry.trim();
  }

  return fromGateway(
    (client) => client.patch("/settings", { section, values } satisfies SettingsBody),
    "تنظیمات ذخیره شد",
  );
}

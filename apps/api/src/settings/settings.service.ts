// What a setting's value may be.
//
// The panel held these rules inside its own save action, in a loop over a section's fields, with the
// checks in the order it happened to write them. Three consequences, all of which the move fixes:
//
//   - A `Float` inside a `Json` column accepts a string. `shipping.localFlatFee` stored as `"200000"`
//     reads back as a string from every consumer, and `Number.isFinite("200000")` is false, so the
//     fee silently became "no fee" rather than an error.
//   - The bounds were three hard-coded key-name arrays inside the loop. Adding a fourth reserved
//     window meant editing a list inside a component.
//   - The audit line was written after the upserts, so a failure between them left changed settings
//     nobody could account for.
//
// The value arrives as a string because a form sends strings, and is converted here to the type the
// column is read as. That conversion is the whole of the typed accessor contract (011/017) — and it
// lives beside the definitions, so a field cannot be declared as a number and stored as a string.

import { isIranPhone, normalizeIranPhone } from "@kmodern/contracts";
import { SETTING_FIELDS, columnKeyFor, type SettingFieldDef } from "./definitions.js";

/**
 * The longest a free-text setting may be.
 *
 * 1000, carried over from the panel's `s.length > 1000` check. It exists because `value` is a `Json`
 * column with no bound, so an unbounded text setting is a row that grows until something else breaks.
 */
const MAX_TEXT_LENGTH = 1000;

/** The largest a numeric setting may be. A fee is in TOMAN; nobody's courier charges 10^15. */
const MAX_NUMBER = 1_000_000_000_000;

/**
 * The value as it will be stored, or the sentence saying why not.
 *
 * A discriminated result rather than a throw, because the caller is validating a whole form and
 * wants to report the first bad field the way the operator typed it — by its *label*, which is what
 * their screen shows, and not by the column key, which they have never seen.
 */
export type ParsedValue = { ok: true; value: string | number } | { ok: false; error: string };

export function parseSettingValue(field: SettingFieldDef, raw: string): ParsedValue {
  const value = raw.trim();

  if (field.type === "enum") {
    if (!field.enumValues?.includes(value)) {
      return { ok: false, error: `مقدار «${field.label}» نامعتبر است` };
    }
    return { ok: true, value };
  }

  if (field.type === "number") {
    // "" means "leave it alone", not "zero" — the same distinction the discount caps turned on, and
    // for the same reason: a reserve window of zero minutes is a real, wrong value rather than an
    // absent one.
    if (value === "") return { ok: true, value: "" };

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return { ok: false, error: `مقدار «${field.label}» باید عدد باشد` };
    }
    if (parsed < 0) {
      return { ok: false, error: `مقدار «${field.label}» نمی‌تواند منفی باشد` };
    }
    if (parsed > MAX_NUMBER) {
      return { ok: false, error: `مقدار «${field.label}» بیش از حد بزرگ است` };
    }
    if (field.integer && !Number.isInteger(parsed)) {
      return { ok: false, error: `مقدار «${field.label}» باید عدد صحیح باشد` };
    }
    if (field.minimum !== undefined && parsed < field.minimum) {
      return { ok: false, error: `مقدار «${field.label}» باید بزرگ‌تر از صفر باشد` };
    }
    return { ok: true, value: parsed };
  }

  if (value.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: `مقدار «${field.label}» بیش از حد طولانی است` };
  }

  // The alert mobile is the one text field that is not free text: it is dialled by a sender, and a
  // typo in it is a notification that never arrives with no error anywhere. Normalised to the one
  // spelling the sender expects, and *checked* against the same function the checkout uses for a
  // shopper's number, so `+989121234567` is accepted as the person it names rather than refused as
  // malformed — which is what the panel's `/^09\d{9}$/` did.
  if (field.key === "adminAlertMobile" && value !== "") {
    if (!isIranPhone(value)) return { ok: false, error: "شماره هشدار معتبر نیست" };
    return { ok: true, value: normalizeIranPhone(value) ?? value };
  }

  return { ok: true, value };
}

/** One field's value, resolved to the column it lands in. */
export interface SettingChange {
  /** The field name, as the form and the audit trail name it. */
  readonly field: string;
  /** The column key, resolved through the shared contract. */
  readonly columnKey: string;
  readonly value: string | number;
}

/**
 * A form's worth of fields, resolved to the values to store.
 *
 * Every key is looked up in the definitions and an unknown one is refused rather than ignored. The
 * panel ignored them, and reported "unknown key" only *after* writing the fields it had already
 * accepted — so a typo in one field saved the others and then reported a failure, leaving the
 * operator unsure what stuck. Refusing first means nothing is written until the whole form is sound.
 */
export function parseSettingsForm(
  values: Readonly<Record<string, string>>,
): { ok: true; changes: SettingChange[] } | { ok: false; error: string } {
  const changes: SettingChange[] = [];

  for (const [field, raw] of Object.entries(values)) {
    const definition = SETTING_FIELDS.get(field);
    if (!definition) return { ok: false, error: `کلید ناشناخته: ${field}` };

    const parsed = parseSettingValue(definition, raw);
    if (!parsed.ok) return parsed;

    // An empty value is an instruction to leave the stored value alone, and is dropped from the
    // change list rather than written as `""`. Storing "" would make a number field read back as a
    // string — the exact defect this module's header describes.
    if (parsed.value === "") continue;

    changes.push({ field, columnKey: columnKeyFor(field), value: parsed.value });
  }

  return { ok: true, changes };
}

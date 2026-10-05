// The settings page, reading what exists from the gateway.
//
// This used to hold its own `SECTION_DEFS` — five sections, their labels, their field types, and one
// field's five enum members — while the save action held a second table saying what each field
// wanted. The two could disagree and nothing noticed: the form rendered whatever this file said
// while the action validated as whatever that one said. A field changed here and forgotten there
// produced either a form the gateway would refuse, or a value accepted as a string where the
// storefront reads a number.
//
// The table is the gateway's now (`GET /settings/definitions`) and the values come keyed in the same
// vocabulary, so this page holds no vocabulary at all. Adding a setting is a change in one place.

import { SettingsForm } from "@/settings/components/settings-form";
import { type SettingSectionDef } from "@/settings/lib/settings";
import { panelGateway } from "@/lib/gateway";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const client = await panelGateway();

  // The two reads are independent and go together. A failure here throws rather than rendering an
  // empty form, because an empty settings form looks exactly like a shop with no settings — and an
  // operator who saved it would blank the ones that are set.
  const [sections, values] = await Promise.all([
    client.get<SettingSectionDef[]>("/settings/definitions"),
    client.get<Record<string, string>>("/settings"),
  ]);

  const byKey: Record<string, SettingSectionDef> = {};
  for (const section of sections) byKey[section.key] = section;

  // Every field gets a box, including one with no stored value — a form that omitted the fields it
  // has never been told about would silently drop them on the next save.
  const initial: Record<string, string> = {};
  for (const section of sections) {
    for (const field of section.fields) initial[field.key] = values[field.key] ?? "";
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-ink">تنظیمات</h1>
      <SettingsForm sections={byKey} initial={initial} />
    </div>
  );
}

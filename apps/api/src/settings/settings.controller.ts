// Settings, at the operator's edge — and the read that tells the panel what to render.
//
// Two reads and one write, and the definitions read is the load-bearing one. The panel used to hold
// its own table of sections and fields in two places that could disagree: the page rendered a `text`
// input for whatever the page's copy said, and the save action validated as whatever the action's
// copy said. The table is here now, served, so a field added to the shop is added once and the form
// cannot offer an input the gateway will refuse — or accept a value the storefront reads as the wrong
// type. `shipping.localFlatFee` is a number inside a `Json` column, so storing the string `"200000"`
// passes every database check and then reads back as "no fee" from every consumer.
//
// The write is one transaction covering every changed row and the audit line. The panel's version
// looped the upserts and wrote the audit line afterwards, so a failure on the last field left the
// earlier ones committed with no record of who changed them.

import { Body, Controller, Get, Inject, Patch, Req } from "@nestjs/common";
import type { Request } from "express";
import { writeAudit } from "../common/audit.js";
import { AuthService } from "../auth/auth.service.js";
import { requireAdmin } from "../auth/identity.js";
import { zarinpalConfigFromEnv } from "../payments/zarinpal.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { SaveSettingsDto } from "./dto/settings.dto.js";
import {
  PUBLIC_SETTING_FIELDS,
  SETTING_SECTIONS,
  columnKeyFor,
  fieldForColumnKey,
  findSection,
} from "./definitions.js";
import { parseSettingsForm } from "./settings.service.js";
import {
  SettingSectionNotFoundException,
  SettingsRuleException,
} from "./exceptions/settings.exception.js";

type Tx = Prisma.TransactionClient;

/** What a save answers with: the fields that changed, for the audit line and the panel's own log. */
export interface SettingsSaved {
  keys: string[];
}

@Controller("settings")
export class SettingsController {
  constructor(
    private readonly auth: AuthService,
    // `PrismaClient` named rather than through a factory's return type: the generated client exports
    // the type in its own right.
    @Inject(DATA_CLIENT) private readonly db: PrismaClient,
  ) {}

  /**
   * What settings exist, and how each one is entered.
   *
   * Served without an operator check on purpose: nothing here is a secret, it is the same vocabulary
   * the storefront's own pages are built from, and a form that cannot describe itself cannot be
   * rendered at all. The *values* are operator-only, because those are.
   */
  @Get("definitions")
  definitions(): typeof SETTING_SECTIONS {
    return SETTING_SECTIONS;
  }

  /**
   * The stored value of every setting the form can show, keyed by field name.
   *
   * Every value is stringified here rather than by the panel, because a form renders text and the
   * column holds JSON: a number setting read raw is a number, a boolean is a boolean, and the panel
   * carried a cast table to turn them back. A value that is neither is left out rather than rendered,
   * which is what `String()` on a nested object would otherwise produce as `[object Object]`.
   *
   * Answered in *field* names, not column keys: the form is built from the definitions above, which
   * address fields by name (`storeName`), while the row is keyed by column (`store.name`). Crossing
   * the two here is what lets the panel hold neither the mapping nor a copy of the key contract.
   */
  @Get()
  async current(@Req() req: Request): Promise<Record<string, string>> {
    await requireAdmin(this.auth, req);

    const rows = await this.db.setting.findMany();
    const out: Record<string, string> = {};

    for (const row of rows) {
      const value = row.value;
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
        continue;
      }
      const field = fieldForColumnKey(row.key);
      // A row the table has no field for is a seed value or one left by a retired setting. Skipping
      // it is right: there is no box to show it in, and inventing one would put an input on the form
      // that the save path would then refuse.
      if (field === undefined) continue;
      out[field] = String(value);
    }

    return out;
  }

  /**
   * Every stored setting, by column key, at its stored type.
   *
   * The read above answers the *form*: field names, stringified, because a form renders text. This one
   * answers the *code*, and the two are not the same question. The inventory page asks what the low
   * stock threshold is as a number and compares a variant's stock against it; the order action asks
   * for a reserve window in minutes and adds it to a date. Both were reading the row directly and
   * carrying a cast table to undo the JSON column, and both then hardcoded the fallback — so the panel
   * was answering "what is the low stock threshold" with a `3` written next to the question, and
   * changing the setting in the shop's own settings form did not change the number the panel used.
   *
   * Keyed by column key because that is how code addresses a setting, and typed because the point of
   * the read is that the caller does not have to know it came out of a `Json` column. A value that is
   * neither scalar nor known is left out, exactly as in the form read.
   */
  @Get("values")
  async values(@Req() req: Request): Promise<Record<string, string | number | boolean>> {
    await requireAdmin(this.auth, req);

    const rows = await this.db.setting.findMany();
    const out: Record<string, string | number | boolean> = {};
    for (const row of rows) {
      const value = row.value;
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") continue;
      out[row.key] = value;
    }
    return out;
  }

  /**
   * The settings a visitor may see, with no operator session.
   *
   * A storefront read that answered with everything would publish the shop's operational settings —
   * whether its SMS provider is configured, its low-stock line, its reserve windows — to anyone who
   * asked. So this is an allowlist rather than a filter, and the list is `public: true` on the field
   * itself, so the decision is made once, next to the setting it is about.
   *
   * The card-to-card details are in it deliberately: a shopper paying by transfer is shown the number
   * to transfer to, so a value that is not readable by the storefront is a value the shopper cannot be
   * told. Answered in *field* names, like the operator read above, because the storefront's chrome is
   * written against field names.
   */
  @Get("public")
  async publicValues(): Promise<Record<string, string | number | boolean>> {
    const wanted = new Set<string>(PUBLIC_SETTING_FIELDS.map((field) => columnKeyFor(field)));
    const rows = await this.db.setting.findMany();
    const out: Record<string, string | number | boolean> = {};
    for (const row of rows) {
      if (!wanted.has(row.key)) continue;
      const value = row.value;
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") continue;
      const field = fieldForColumnKey(row.key);
      if (field === undefined) continue;
      out[field] = value;
    }
    // Two capabilities the storefront needs and cannot know, answered from the configuration that only
    // this process holds. The storefront used to decide both by reading the merchant's payment
    // provider's credentials out of its *own* environment, which put a merchant credential in a second
    // process to answer a yes/no question — and meant the storefront and the gateway could disagree
    // about whether online payment works, one of which would offer a method the other cannot complete.
    //
    // Computed rather than stored, because a stored flag is a thing an operator can forget to update
    // and a checkout page offering a dead payment method is the exact failure this replaces.
    out.onlinePaymentEnabled = zarinpalConfigFromEnv() !== null;
    out.c2cPaymentConfigured =
      typeof out.paymentC2cCardNumber === "string" && out.paymentC2cCardNumber.trim() !== "";
    return out;
  }

  /**
   * Save a section's fields.
   *
   * `PATCH` rather than `PUT` because the form sends the fields it rendered and leaves the rest of the
   * shop's settings alone; a `PUT` to `/settings` would be read as "these are all of them".
   */
  @Patch()
  async save(@Req() req: Request, @Body() body: SaveSettingsDto): Promise<SettingsSaved> {
    const admin = await requireAdmin(this.auth, req);

    const section = findSection(body.section);
    if (!section) throw new SettingSectionNotFoundException(body.section);

    // The whole form is judged before a single row is written. The panel judged each field in turn
    // and stopped at the first bad one, having already committed the fields before it — so a form
    // with one typo saved half its values and then reported a failure.
    const parsed = parseSettingsForm(body.values);
    if (!parsed.ok) throw new SettingsRuleException(parsed.error);

    return this.db.$transaction(async (tx) => {
      for (const change of parsed.changes) {
        await tx.setting.upsert({
          where: { key: change.columnKey },
          update: { value: change.value as never },
          create: { key: change.columnKey, value: change.value as never },
        });
      }

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "SETTINGS_UPDATED",
        entityType: "SETTINGS",
        entityId: section.key,
        // The *field* names, not the column keys: the audit trail is read by whoever asks "what did
        // the operator change", and the form is what they saw.
        meta: { keys: parsed.changes.map((change) => change.field) },
      });

      return { keys: parsed.changes.map((change) => change.field) };
    });
  }
}

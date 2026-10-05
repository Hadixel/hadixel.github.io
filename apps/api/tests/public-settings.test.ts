// What a visitor may read of the shop's settings.
//
// The same table holds what the storefront renders and what it must never be told: whether the SMS
// provider is configured, the low-stock line the shop reorders at, the reserve windows its checkout
// holds stock for. A storefront read that answered with all of it would hand an unauthenticated caller
// an operational map of the business, and nothing about the response would look wrong.
//
// So the test is about the *absence* of things, which is the half a settings test usually skips.

import { beforeEach, describe, expect, it } from "vitest";
import { SettingsController } from "../src/settings/settings.controller.js";
import { LOW_STOCK_FIELD, PUBLIC_SETTING_FIELDS, SETTING_SECTIONS } from "../src/settings/definitions.js";
import { AuthService } from "../src/auth/auth.service.js";
import { OtpService } from "../src/auth/otp.service.js";
import { db } from "../src/prisma/index.js";
import { resetDatabase } from "./harness.js";

function controller(): SettingsController {
  const client = db();
  return new SettingsController(
    new AuthService(client as never, new OtpService(client as never)),
    client as never,
  );
}

/**
 * Store a value under its column key, which is what the seed and the settings write do.
 *
 * Written by column key rather than by looking the field up in the definitions, because one of the
 * settings under test is not in that table at all — `smsProviderConfigured` is computed by the gateway
 * rather than typed into a form. A helper that refused to write that row would make its test vacuous.
 */
async function store(fieldKey: string, value: unknown) {
  const { settingKeys } = await import("@kmodern/contracts/setting-keys");
  const columnKey = settingKeys[fieldKey as keyof typeof settingKeys];
  if (columnKey === undefined) throw new Error(`no such setting key: ${fieldKey}`);
  return db().setting.create({ data: { key: columnKey, value: value as never } });
}

beforeEach(resetDatabase);

describe("the public settings read", () => {
  it("serves the shop's name to a caller with no session", async () => {
    await store("storeName", "خانه مدرن");
    // No cookie, no operator, no argument: this is the request an anonymous visitor makes.
    const answer = await controller().publicValues();
    expect(answer.storeName).toBe("خانه مدرن");
  });

  it("serves the card-to-card details, because a shopper is shown them to transfer money", async () => {
    await store("paymentC2cCardNumber", "6037-9999-8888-7777");
    await store("paymentC2cCardHolder", "خانه مدرن");
    await store("paymentC2cBankName", "ملی");
    const answer = await controller().publicValues();
    expect(answer.paymentC2cCardNumber).toBe("6037-9999-8888-7777");
    expect(answer.paymentC2cBankName).toBe("ملی");
  });

  it("does not serve the reserve windows or the low-stock line", async () => {
    // These two are the ones that fail when the allowlist is removed, so they are what the allowlist
    // is actually pinned by.
    await store("checkoutOnlineReserveMinutes", 30);
    await store("checkoutC2cReserveHours", 48);
    await store(LOW_STOCK_FIELD, 3);
    const answer = await controller().publicValues();
    for (const key of ["checkoutOnlineReserveMinutes", "checkoutC2cReserveHours", LOW_STOCK_FIELD]) {
      expect(answer, key).not.toHaveProperty(key);
    }
  });

  it("does not serve the store's logo or its SEO defaults", async () => {
    // A logo is an asset URL, not a secret — but the list is the list, and a boundary that is
    // incidental is a boundary that changes the next time somebody adds a field.
    await store("storeLogo", "https://cdn.example/logo.png");
    await store("seoDefaultTitle", "title");
    const answer = await controller().publicValues();
    expect(answer).not.toHaveProperty("storeLogo");
    expect(answer).not.toHaveProperty("seoDefaultTitle");
  });

  it("does not serve whether the SMS provider is configured", async () => {
    // Worth being precise about how this one is held, because it is held twice over:
    // `smsProviderConfigured` is not in `wanted`, and it also has no entry in the settings table, so
    // `fieldForColumnKey` drops it whatever the allowlist says. Removing the allowlist entirely leaves
    // *this* test green — the two above are the ones that fail. A test that cannot fail on the defect
    // it is named for reads like coverage, so the distinction is stated rather than discovered later.
    await store("smsProviderConfigured", true);
    const answer = await controller().publicValues();
    expect(answer).not.toHaveProperty("smsProviderConfigured");
  });

  it("leaves out a private field whose stored value is false", async () => {
    // `false` is falsy, so a filter written as `if (value)` would drop it by accident; a filter
    // written as `if (!value)` would publish it. The check is on the key, never the value.
    await store("checkoutOnlineReserveMinutes", 0);
    const answer = await controller().publicValues();
    expect(answer).not.toHaveProperty("checkoutOnlineReserveMinutes");
  });

  it("answers in field names, because the storefront's chrome is written against field names", async () => {
    await store("storeName", "خانه مدرن");
    const answer = await controller().publicValues();
    // `store.name` is the column key; `storeName` is the field. Publishing the column key would force
    // every caller to know the storage layout.
    expect(answer).toHaveProperty("storeName");
    expect(answer).not.toHaveProperty("store.name");
  });

  it("omits a non-scalar value rather than rendering it as [object Object]", async () => {
    await db().setting.create({ data: { key: "store.name", value: { nested: true } as never } });
    const answer = await controller().publicValues();
    expect(JSON.stringify(answer)).not.toMatch(/\[object Object\]/);
  });

  it("serves only fields marked public, and the flag lives beside the field", () => {
    // Derived rather than listed, so this checks the derivation: a field with `public: true` is
    // published, and one without the flag never is, however it was added.
    expect(PUBLIC_SETTING_FIELDS).toContain("storeName");
    expect(PUBLIC_SETTING_FIELDS).toContain("paymentC2cCardNumber");
    expect(PUBLIC_SETTING_FIELDS).not.toContain("smsProviderConfigured");
    expect(PUBLIC_SETTING_FIELDS).not.toContain(LOW_STOCK_FIELD);
    expect(PUBLIC_SETTING_FIELDS).not.toContain("checkoutOnlineReserveMinutes");

    const marked = SETTING_SECTIONS.flatMap((s) => s.fields)
      .filter((f) => f.public)
      .map((f) => f.key);
    expect([...PUBLIC_SETTING_FIELDS].sort()).toEqual(marked.sort());
  });
});

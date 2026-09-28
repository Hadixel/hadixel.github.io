// The panel's settings write, as the gateway applies it.
//
// Settings is the smallest write in the shop and the one with the most copies of its own rules. Three
// tables existed: the page's `SECTION_DEFS` (labels, input types, one field's enum members), the
// action's `SECTIONS` (a field→type map plus the bounds), and `settingKeys` (the names). The page
// rendered from one and the action validated from the other, so the pair could disagree without
// anything noticing — and the disagreement is invisible until a value is stored in the wrong shape.
//
// Which is the more interesting defect, and the one these tests mostly pin, is the type itself.
// `Setting.value` is a `Json` column, so `"200000"` and `200000` are both storable and both accepted
// by every constraint the database has. A string where the storefront reads a number is not an error
// anywhere — it is a fee that has quietly become "no fee", because `Number.isFinite("200000")` is
// false and every reader that checks it takes the failure branch.

import { beforeEach, describe, expect, it } from "vitest";
import type { createPrismaClient } from "../src/prisma/client.js";
import { SettingsController } from "../src/settings/settings.controller.js";
import { db } from "../src/prisma/index.js";
import { resetDatabase } from "./harness.js";

type Db = ReturnType<typeof createPrismaClient>;

/**
 * The real database, with the audit write rigged to fail.
 *
 * A proxy rather than a fixture, for the reason `admin-writes.test.ts` gives: every other statement
 * still hits the real database, so the rollback being asserted is a real rollback.
 */
function dbWithFailingAudit(): Db {
  const real = db() as Db;
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === "$transaction") {
        return async (fn: (tx: unknown) => unknown) =>
          (target.$transaction as (f: (tx: unknown) => unknown) => unknown)((tx: unknown) =>
            fn(
              new Proxy(tx as object, {
                get(txTarget, txProp) {
                  if (txProp === "adminAuditLog") {
                    return { create: () => Promise.reject(new Error("AUDIT_WRITE_FAILED")) };
                  }
                  return Reflect.get(txTarget, txProp, txTarget);
                },
              }),
            ),
          );
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as Db;
}

describe("an operator saves settings", () => {
  beforeEach(resetDatabase);
  let operatorId: string;

  beforeEach(async () => {
    const operator = await db().adminUser.create({
      data: {
        email: "operator@kmodern.ir",
        name: "اپراتور",
        passwordHash: "scrypt$00$00",
        isActive: true,
      },
    });
    operatorId = operator.id;
  });

  function controller(client: Db = db() as Db) {
    const auth = {
      adminForToken: async (token: string) =>
        token === "good" ? { admin: { id: operatorId, email: "operator@kmodern.ir" } } : null,
    } as never;
    return new SettingsController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  /** The stored value, read back raw so a string-vs-number defect cannot hide behind a cast. */
  async function stored(columnKey: string): Promise<unknown> {
    const row = await db().setting.findUnique({ where: { key: columnKey } });
    return row?.value;
  }

  it("stores a number field as a number, not as the string the form sent", async () => {
    // The whole point. The form posts a string; the column is `Json`; and a string stored here reads
    // back as "no fee" from every consumer that checks it.
    await controller().save(request(), {
      section: "shipping",
      values: { shippingLocalFlatFee: "200000" },
    } as never);

    expect(await stored("shipping.localFlatFee")).toBe(200000);
    expect(typeof (await stored("shipping.localFlatFee"))).toBe("number");
  });

  it("stores an enum as the member the table names", async () => {
    await controller().save(request(), {
      section: "shipping",
      values: { shippingLocalFeeMode: "FREIGHT_COLLECT" },
    } as never);

    expect(await stored("shipping.localFeeMode")).toBe("FREIGHT_COLLECT");
  });

  it("refuses an enum member the table does not have", async () => {
    await expect(
      controller().save(request(), {
        section: "shipping",
        values: { shippingLocalFeeMode: "FREE_DOG" },
      } as never),
    ).rejects.toThrow(/نامعتبر/);

    expect(await db().setting.count()).toBe(0);
  });

  it("refuses a negative number, and a number that is not a number", async () => {
    for (const value of ["-1", "twelve"]) {
      await expect(
        controller().save(request(), {
          section: "shipping",
          values: { shippingLocalFlatFee: value },
        } as never),
        value,
      ).rejects.toThrow();
    }
    expect(await db().setting.count()).toBe(0);
  });

  it("insists on a whole number for a count, which the table declares rather than a list of names", async () => {
    // The panel checked this with two hard-coded key-name arrays inside its loop. Adding a fourth
    // counted field meant editing a list inside a component; here it is a field of the definition.
    await expect(
      controller().save(request(), {
        section: "inventory",
        values: { inventoryLowStockThreshold: "2.5" },
      } as never),
    ).rejects.toThrow(/صحیح/);

    expect(await db().setting.count()).toBe(0);
  });

  it("insists on at least one for a reserve window, so a hold cannot last no time", async () => {
    // Zero minutes is a real, wrong value rather than an absent one: the reservation would expire the
    // instant it was taken, and a shopper's payment would be released while it was in flight.
    await expect(
      controller().save(request(), {
        section: "inventory",
        values: { checkoutOnlineReserveMinutes: "0" },
      } as never),
    ).rejects.toThrow(/بزرگ‌تر از صفر/);
  });

  it("leaves a blank field alone rather than storing an empty string where a number is read", async () => {
    // The form posts every input in the section, blank ones included. Storing "" would make the next
    // read produce `""`, which is neither a number nor absent — and `Number.isFinite("")` is false.
    await controller().save(request(), {
      section: "shipping",
      values: { shippingBarberiNote: "با پیک" },
    } as never);

    await controller().save(request(), {
      section: "shipping",
      values: { shippingLocalFlatFee: "" },
    } as never);

    expect(await stored("shipping.localFeeFee")).toBeUndefined();
    expect(await stored("shipping.barberiNote")).toBe("با پیک");
  });

  it("normalises the alert mobile, so the person is dialled rather than refused", async () => {
    // The panel's `/^09\d{9}$/` accepted one spelling of an Iranian mobile number and rejected every
    // other way of writing the same person — including `+98…` and a Persian-digit version. A
    // notification address is not something to be precious about: the same normaliser the checkout
    // uses for a shopper's number is the right one here.
    for (const [typed, storedValue] of [
      ["+989121234567", "09121234567"],
      ["۰۹۱۲۱۲۳۴۵۶۷", "09121234567"],
      ["9121234567", "09121234567"],
    ] as const) {
      await controller().save(request(), {
        section: "notifications",
        values: { adminAlertMobile: typed },
      } as never);

      expect(await stored("admin.alertMobile"), typed).toBe(storedValue);
    }
  });

  it("refuses a number that cannot be one", async () => {
    await expect(
      controller().save(request(), {
        section: "notifications",
        values: { adminAlertMobile: "0912" },
      } as never),
    ).rejects.toThrow(/شماره هشدار/);

    expect(await db().setting.count()).toBe(0);
  });

  it("refuses a field the table has never heard of, before writing anything", async () => {
    // The panel wrote the fields it had already accepted and only then reported the unknown key, so a
    // form with one typo saved half its values and then said it had failed. Refusing first means
    // either the whole form lands or none of it does.
    await expect(
      controller().save(request(), {
        section: "shipping",
        values: { shippingLocalFlatFee: "200000", shipingLocalFlatFee: "1" },
      } as never),
    ).rejects.toThrow(/ناشناخته/);

    expect(await db().setting.count()).toBe(0);
  });

  it("writes nothing when any one field of the form is bad", async () => {
    // The ordering the panel had: it looped, committed the good fields, and stopped at the bad one.
    await expect(
      controller().save(request(), {
        section: "shipping",
        values: { shippingBarberiNote: "با پیک", shippingLocalFlatFee: "-5" },
      } as never),
    ).rejects.toThrow();

    expect(await db().setting.count()).toBe(0);
  });

  it("records what changed, in the field names the operator saw", async () => {
    const saved = await controller().save(request(), {
      section: "store",
      values: { storeName: "خانه مدرن" },
    } as never);

    expect(saved.keys).toEqual(["storeName"]);

    const lines = await db().adminAuditLog.findMany({ where: { entityId: "store" } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ action: "SETTINGS_UPDATED", entityType: "SETTINGS" });
  });

  it("does not save anything when the audit write fails", async () => {
    // The panel's helper ran its insert after the upserts had already committed, so this left changed
    // settings nobody could account for and told the operator they had saved.
    await expect(
      controller(dbWithFailingAudit()).save(request(), {
        section: "store",
        values: { storeName: "خانه مدرن" },
      } as never),
    ).rejects.toThrow("AUDIT_WRITE_FAILED");

    expect(await db().setting.count()).toBe(0);
    expect(await db().adminAuditLog.count()).toBe(0);
  });

  it("answers a section the shop does not have as absent", async () => {
    await expect(
      controller().save(request(), { section: "wizardry", values: {} } as never),
    ).rejects.toThrow(/پیدا نشد/);
  });

  it("does not save settings for an unauthenticated request", async () => {
    await expect(
      controller().save({ headers: { cookie: "kmodern_admin=bad" } } as never, {
        section: "store",
        values: { storeName: "خانه مدرن" },
      } as never),
    ).rejects.toThrow();

    expect(await db().setting.count()).toBe(0);
  });
});

describe("the panel is told what settings exist", () => {
  beforeEach(resetDatabase);
  let operatorId: string;

  beforeEach(async () => {
    const operator = await db().adminUser.create({
      data: {
        email: "operator@kmodern.ir",
        name: "اپراتور",
        passwordHash: "scrypt$00$00",
        isActive: true,
      },
    });
    operatorId = operator.id;
  });

  function controller(client: Db = db() as Db) {
    const auth = {
      adminForToken: async (token: string) =>
        token === "good" ? { admin: { id: operatorId, email: "operator@kmodern.ir" } } : null,
    } as never;
    return new SettingsController(auth, client);
  }

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  it("serves the sections and their fields, so the panel renders from this rather than a copy", async () => {
    const sections = controller().definitions();
    const shipping = sections.find((section) => section.key === "shipping");

    expect(shipping?.fields.map((field) => field.key)).toContain("shippingLocalFlatFee");
    expect(shipping?.fields.find((f) => f.key === "shippingLocalFeeMode")?.enumValues).toContain(
      "FREIGHT_COLLECT",
    );
  });

  it("serves the stored values in field names, so the panel holds no key mapping", async () => {
    // `Setting.key` is a column name (`store.name`); the form is built from field names
    // (`storeName`). Answering in field names is what removes the mapping from the panel — and with it
    // the third copy of the key contract that came with it.
    await db().setting.create({ data: { key: "store.name", value: "خانه مدرن" } });
    await db().setting.create({ data: { key: "shipping.localFlatFee", value: 200000 } });

    const values = await controller().current(request());

    expect(values).toMatchObject({ storeName: "خانه مدرن", shippingLocalFlatFee: "200000" });
    // A number is stringified for the form, and the *type* is decided by the definitions the form also
    // came from — not by a cast table the panel holds.
    expect(typeof values["shippingLocalFlatFee"]).toBe("string");
  });

  it("leaves a stored value the form has no field for out of the answer", async () => {
    // A seed value, or one left by a retired setting. There is no box to show it in, and inventing
    // one would put an input on the form that the save path would then refuse.
    await db().setting.create({ data: { key: "legacy.retiredThing", value: "x" } });

    const values = await controller().current(request());

    expect(Object.keys(values)).toHaveLength(0);
  });

  it("does not show the values to an unauthenticated request", async () => {
    await db().setting.create({ data: { key: "store.name", value: "خانه مدرن" } });

    await expect(
      controller().current({ headers: { cookie: "kmodern_admin=bad" } } as never),
    ).rejects.toThrow();
  });
});

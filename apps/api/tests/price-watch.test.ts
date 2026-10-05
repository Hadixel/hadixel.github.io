// The watch, as the gateway applies it.
//
// Two things are being pinned here, and they are the two the feature exists to guarantee:
//
//   1. **The check records and never writes.** A detected difference becomes a `PENDING` row and
//      `Variant.price` is untouched. This is asserted by *watching which client the write goes to*,
//      the way `admin-writes.test.ts` does it, rather than by racing a check against an apply — a
//      race decides by luck, and a test that passes or fails by luck is worse than none.
//   2. **The apply is one transaction with one audit line.** A failure at the audit write must roll
//      the price back, and forty applied changes must produce forty prices and *one* line, because
//      forty lines bury every other entry in the trail.
//
// The client is a `Proxy` over the real one and never a `vi.spyOn` on a model getter. The ADR
// records why: a spy on a Prisma model's getter leaks into every later test in the same file, and
// the leak shows up as a test that fails for a reason that has nothing to do with what it asserts.

import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/prisma/index.js";
import type { createPrismaClient } from "../src/prisma/index.js";
import { resetDatabase } from "./harness.js";
import {
  applyPriceChanges,
  ignorePriceChanges,
  listPriceChanges,
  recordDifferences,
  runPriceWatchCheck,
  savePriceWatchConfig,
  PRICE_WATCH_ID,
  type PriceWatchActor,
} from "../src/price-watch/price-watch.service.js";

type Db = ReturnType<typeof createPrismaClient>;

/** The real database, with the audit write rigged to fail. See the header for why a proxy. */
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

/**
 * A client that records every statement name it is asked for.
 *
 * This is the whole of the "the check never writes a price" assertion: the check runs against this
 * client, and the test reads which models it touched. A test that instead re-read the variant and
 * compared the price would pass against an implementation that wrote the price and then wrote it
 * back to the same value.
 */
function dbRecordingStatements(seen: string[]): Db {
  const real = db() as Db;
  const MODELS = new Set(["product", "variant", "priceChange", "priceWatch", "priceWatchRun", "adminAuditLog"]);
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && MODELS.has(prop)) seen.push(prop);
      return Reflect.get(target, prop, receiver);
    },
  }) as Db;
}

const quote = (price: number, extra: Record<string, unknown> = {}) => ({
  price,
  currency: "TOMAN" as const,
  fetchedAt: 1,
  sourceId: "dateesshop" as const,
  sourceUrl: "https://dateesshop.com/product/x",
  productName: "x",
  ...extra,
});

/** A Datees product with one variant, plus the category a product needs to exist. */
async function seedProduct(overrides: { name?: string; model?: string; brand?: string; price?: number; colorName?: string } = {}) {
  const category = await db().category.create({ data: { name: "یخچال", slug: `fridge-${Math.random().toString(36).slice(2)}`, weightKg: 1 } });
  const product = await db().product.create({
    data: {
      slug: `p-${Math.random().toString(36).slice(2)}`,
      name: overrides.name ?? "یخچال فریزر ایکس ویوی",
      brand: overrides.brand ?? "Datees",
      model: overrides.model ?? "X-203",
      categoryId: category.id,
      features: [],
    },
  });
  const variant = await db().variant.create({
    data: {
      productId: product.id,
      colorName: overrides.colorName ?? "نقره‌ای",
      sku: `SKU-${Math.random().toString(36).slice(2)}`,
      price: overrides.price ?? 10_000_000,
    },
  });
  return { product, variant };
}

/**
 * The operator the apply tests act as, created per test so the foreign key has a row to point at.
 *
 * `AdminAuditLog.adminUserId` is a real constraint, so an audit line naming an invented id is
 * refused by the database rather than written — which means a test using a made-up one is testing
 * that constraint and not the apply. `resetDatabase` empties the table between tests, so the row
 * has to be created after it rather than once for the file.
 */
async function actingOperator(): Promise<PriceWatchActor> {
  const admin = await db().adminUser.create({
    data: {
      email: `owner-${Math.random().toString(36).slice(2)}@kmodern.ir`,
      name: "مالک",
      passwordHash: "scrypt$00$00",
      isActive: true,
    },
  });
  return { adminUserId: admin.id, ip: null, userAgent: null };
}

describe("the watch records differences and does not apply them", () => {
  beforeEach(resetDatabase);

  it("writes a PENDING row for a variant whose price differs, and leaves the price alone", async () => {
    const { product, variant } = await seedProduct();
    const run = await db().priceWatchRun.create({ data: { status: "RUNNING", trigger: "MANUAL" } });

    // The index is keyed the way `fetchDateesShopPriceIndex` keys it: `modelKey(product.model)`.
    const index = new Map([["X-203", quote(9_500_000)]]);
    const result = await recordDifferences(db() as Db, run.id, index as never);

    expect(result.matched).toBe(1);
    expect(result.changes).toHaveLength(1);

    const rows = await db().priceChange.findMany({ where: { runId: run.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      variantId: variant.id,
      productId: product.id,
      sku: variant.sku,
      fromPrice: 10_000_000,
      toPrice: 9_500_000,

      // The finding is a question for an operator, never an answer.
      status: "PENDING",
    });

    // The load-bearing half. Nothing in a check may move a price.
    const after = await db().variant.findUnique({ where: { id: variant.id } });
    expect(after?.price).toBe(10_000_000);
  });

  // Stated as *which client* the write goes to, per the header. A variant read here could be the
  // top-level client and the write the transaction's, or the reverse, and the ADR records a real
  // compare-and-set that was written so it could not fire while looking exactly like one that works.
  it("never issues a variant write of any kind during a check", async () => {
    await seedProduct();
    const run = await db().priceWatchRun.create({ data: { status: "RUNNING", trigger: "MANUAL" } });

    const seen: string[] = [];
    const index = new Map([["X-203", quote(1)]]);
    await recordDifferences(dbRecordingStatements(seen), run.id, index as never);

    expect(seen).toContain("priceChange");
    expect(seen).not.toContain("variant");
  });

  it("records nothing for a variant whose price already matches", async () => {
    await seedProduct({ price: 9_500_000 });
    const run = await db().priceWatchRun.create({ data: { status: "RUNNING", trigger: "MANUAL" } });

    const index = new Map([["X-203", quote(9_500_000)]]);
    const result = await recordDifferences(db() as Db, run.id, index as never);

    expect(result.matched).toBe(1);
    expect(result.changes).toHaveLength(0);
    expect(await db().priceChange.count({ where: { runId: run.id } })).toBe(0);
  });

  it("skips a product the source does not carry, without calling it a failure", async () => {
    await seedProduct({ model: "ZZ-999" });
    const run = await db().priceWatchRun.create({ data: { status: "RUNNING", trigger: "MANUAL" } });

    const index = new Map([["X-203", quote(1)]]);
    const result = await recordDifferences(db() as Db, run.id, index as never);

    // The two catalogues overlap; they are not the same catalogue. Counting the misses as errors is
    // how a perfectly good run gets reported as a broken one.
    expect(result.matched).toBe(0);
    expect(await db().priceChange.count({ where: { runId: run.id } })).toBe(0);
  });

  it("ignores a product of another brand, so two brands' names cannot collide into findings", async () => {
    await seedProduct({ brand: "schuffel", name: "یخچال فریزر ایکس ویوی", model: "X-203" });
    const run = await db().priceWatchRun.create({ data: { status: "RUNNING", trigger: "MANUAL" } });

    const index = new Map([["X-203", quote(1)]]);
    const result = await recordDifferences(db() as Db, run.id, index as never);

    expect(result.matched).toBe(0);
  });

  // Found by running this against the development database: every Datees product there carries
  // `brand = "Datees"` in title case, because that is what the scraper import writes, while the
  // slug vocabulary lowercases the same value. A filter on `"datees"` matched nothing at all, and a
  // watch that fetches three hundred prices and reports no differences looks exactly like a
  // healthy watch. Both spellings are asserted so the filter cannot drift back to one of them.
  it("finds the watched brand whatever case the import stored it in", async () => {
    for (const brand of ["datees", "Datees", "DATEES"]) {
      await resetDatabase();
      await seedProduct({ brand });
      const run = await db().priceWatchRun.create({ data: { status: "RUNNING", trigger: "MANUAL" } });
      const result = await recordDifferences(db() as Db, run.id, new Map([["X-203", quote(1)]]) as never);
      expect(result.matched).toBe(1);
    }
  });

  it("prefers the source's per-colour price over the product's overall minimum", async () => {
    // The case that makes a wrong price rather than no price. `X-203`'s overall price is the
    // cheapest colour; the black variant's own price is higher, and applying the minimum would
    // reprice black to something the source never quoted.
    await seedProduct({ colorName: "مشکی" });
    const run = await db().priceWatchRun.create({ data: { status: "RUNNING", trigger: "MANUAL" } });

    const index = new Map([["X-203", quote(9_000_000, { priceByColor: { black: 11_000_000 } })]]);
    await recordDifferences(db() as Db, run.id, index as never);

    const row = await db().priceChange.findFirst({ where: { runId: run.id } });
    expect(row?.toPrice).toBe(11_000_000);
  });

  it("falls back to the product price for a colour the source did not quote", async () => {
    await seedProduct({ colorName: "کرم" });
    const run = await db().priceWatchRun.create({ data: { status: "RUNNING", trigger: "MANUAL" } });

    const index = new Map([["X-203", quote(9_000_000, { priceByColor: { black: 11_000_000 } })]]);
    await recordDifferences(db() as Db, run.id, index as never);

    // "کرم" maps to `beige`, which the source did not quote. The product price is the honest
    // fallback; a variant silently skipped would be a difference nobody ever sees.
    const row = await db().priceChange.findFirst({ where: { runId: run.id } });
    expect(row?.toPrice).toBe(9_000_000);
  });

  // The second layer of the availability rule. The source filters dead variants before it ever
  // builds a quote, but a quote carries `inStock` and a caller that hands one in saying `false` is
  // saying "this product is not for sale" — which is what a Datees page for a sold-out model is. The
  // queue must not be shown as pending work for a product nobody can buy: an operator applying one
  // would be repricing this shop against a price for an item the source itself will not ship.
  it("records nothing when the source's quote is marked out of stock", async () => {
    await seedProduct();
    const run = await db().priceWatchRun.create({ data: { status: "RUNNING", trigger: "MANUAL" } });

    const index = new Map([["X-203", quote(9_500_000, { inStock: false })]]);
    const result = await recordDifferences(db() as Db, run.id, index as never);

    expect(result.matched).toBe(1);
    expect(result.changes).toHaveLength(0);
    expect(await db().priceChange.findMany({ where: { runId: run.id } })).toHaveLength(0);

    // And nothing moved: the guard skips the variant without ever reaching a write.
    const after = await db().variant.findFirstOrThrow({});
    expect(after.price).toBe(10_000_000);
  });
});

describe("applying recorded changes", () => {
  beforeEach(resetDatabase);

  it("writes the new price, marks the row applied, and writes exactly one audit line", async () => {
    const operator = await actingOperator();
    const { variant } = await seedProduct();
    const run = await db().priceWatchRun.create({ data: { status: "RUNNING", trigger: "MANUAL" } });
    const index = new Map([["X-203", quote(9_500_000)]]);
    await recordDifferences(db() as Db, run.id, index as never);
    const change = await db().priceChange.findFirstOrThrow({ where: { runId: run.id } });

    const result = await applyPriceChanges(db() as Db, { ids: [change.id] }, operator);
    expect(result.applied).toBe(1);

    const after = await db().variant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(after.price).toBe(9_500_000);

    const row = await db().priceChange.findUniqueOrThrow({ where: { id: change.id } });
    expect(row.status).toBe("APPLIED");
    expect(row.appliedById).toBe(operator.adminUserId);
    expect(row.appliedAt).toBeInstanceOf(Date);

    // One line for the batch. `media.controller.ts` states the rule for a hundred uploads and this
    // is the same case: the count belongs in the line, not in the number of lines.
    const lines = await db().adminAuditLog.findMany({ where: { action: "PRICE_CHANGES_APPLIED" } });
    expect(lines).toHaveLength(1);
    expect(lines[0].meta).toMatchObject({ applied: 1, allPending: false });
  });

  it("writes one line for a batch, not one per change", async () => {
    const operator = await actingOperator();
    const category = await db().category.create({ data: { name: "دسته", slug: `c-${Math.random().toString(36).slice(2)}`, weightKg: 1 } });
    const ids: string[] = [];
    for (let n = 0; n < 5; n += 1) {
      const product = await db().product.create({
        data: { slug: `bp-${n}-${Math.random().toString(36).slice(2)}`, name: `محصول ${n}`, brand: "Datees", model: `M-${n}`, categoryId: category.id, features: [] },
      });
      const variant = await db().variant.create({ data: { productId: product.id, colorName: "مشکی", sku: `B${n}-${Math.random().toString(36).slice(2)}`, price: 100 } });
      const run = await db().priceWatchRun.create({ data: { status: "RUNNING", trigger: "MANUAL" } });
      await recordDifferences(db() as Db, run.id, new Map([[`M-${n}`, quote(90)]]) as never);
      ids.push((await db().priceChange.findFirstOrThrow({ where: { runId: run.id } })).id);
      expect(variant.id).toBeTruthy();
    }

    const result = await applyPriceChanges(db() as Db, { ids }, operator);
    expect(result.applied).toBe(5);

    const lines = await db().adminAuditLog.findMany({ where: { action: "PRICE_CHANGES_APPLIED" } });
    expect(lines).toHaveLength(1);
    expect(lines[0].meta).toMatchObject({ applied: 5 });
  });

  it("applies every pending change when no ids are sent", async () => {
    const operator = await actingOperator();
    const category = await db().category.create({ data: { name: "دسته", slug: `c-${Math.random().toString(36).slice(2)}`, weightKg: 1 } });
    for (let n = 0; n < 3; n += 1) {
      const product = await db().product.create({
        data: { slug: `ap-${n}-${Math.random().toString(36).slice(2)}`, name: `محصول ${n}`, brand: "Datees", model: `A-${n}`, categoryId: category.id, features: [] },
      });
      await db().variant.create({ data: { productId: product.id, colorName: "سفید", sku: `A${n}-${Math.random().toString(36).slice(2)}`, price: 100 } });
    }
    const run = await db().priceWatchRun.create({ data: { status: "RUNNING", trigger: "MANUAL" } });
    await recordDifferences(
      db() as Db,
      run.id,
      new Map([["A-0", quote(90)], ["A-1", quote(90)], ["A-2", quote(90)]]) as never,
    );
    expect(await db().priceChange.count({ where: { runId: run.id } })).toBe(3);

    // The empty list is this route's most-used input, not a mistake — which is why the DTO caps the
    // list rather than length-checking it. `@Length` on an array refuses the empty one outright.
    const result = await applyPriceChanges(db() as Db, { ids: [] }, operator);
    expect(result.applied).toBe(3);
    expect(await db().priceChange.count({ where: { status: "APPLIED" } })).toBe(3);
  });

  it("does not move a price twice when an operator clicks apply twice", async () => {
    const operator = await actingOperator();
    const { variant } = await seedProduct();
    const run = await db().priceWatchRun.create({ data: { status: "RUNNING", trigger: "MANUAL" } });
    await recordDifferences(db() as Db, run.id, new Map([["X-203", quote(9_500_000)]]) as never);
    const change = await db().priceChange.findFirstOrThrow({ where: { runId: run.id } });

    await applyPriceChanges(db() as Db, { ids: [change.id] }, operator);
    // The panel still renders the row between the click and the refresh, so the second click is
    // ordinary rather than a bug — and it must be a no-op, not a second write.
    const second = await applyPriceChanges(db() as Db, { ids: [change.id] }, operator);

    expect(second.applied).toBe(0);
    expect(second.skipped).toBe(1);
    expect((await db().variant.findUniqueOrThrow({ where: { id: variant.id } })).price).toBe(9_500_000);
  });

  it("refuses when there is nothing to apply, rather than reporting a success that did nothing", async () => {
    const operator = await actingOperator();
    await expect(applyPriceChanges(db() as Db, {}, operator)).rejects.toThrow(/پیدا نشد/);
  });

  it("rolls every price back when the audit line cannot be written", async () => {
    const operator = await actingOperator();
    const { variant } = await seedProduct();
    const run = await db().priceWatchRun.create({ data: { status: "RUNNING", trigger: "MANUAL" } });
    await recordDifferences(db() as Db, run.id, new Map([["X-203", quote(9_500_000)]]) as never);
    const change = await db().priceChange.findFirstOrThrow({ where: { runId: run.id } });

    await expect(applyPriceChanges(dbWithFailingAudit(), { ids: [change.id] }, operator)).rejects.toThrow(
      /AUDIT_WRITE_FAILED/,
    );

    // The point of the audit line being the transaction's last statement: a price that moved with no
    // record of who moved it is the failure ADR-0003 exists to end.
    expect((await db().variant.findUniqueOrThrow({ where: { id: variant.id } })).price).toBe(10_000_000);
    expect((await db().priceChange.findUniqueOrThrow({ where: { id: change.id } })).status).toBe("PENDING");
  });

  it("leaves the scraper's provenance blob alone", async () => {
    const operator = await actingOperator();
    // `extraSpecs.scraperPrice` is what the *import* found. Overwriting it from a watch would
    // replace a record of an import with a record of a watch, and the next import would then
    // compare against prices a watch wrote.
    const { product, variant } = await seedProduct();
    await db().product.update({
      where: { id: product.id },
      data: { extraSpecs: { specs: {}, scraperPrice: { sourceId: "dateesshop", price: 10_000_000 } } },
    });
    const run = await db().priceWatchRun.create({ data: { status: "RUNNING", trigger: "MANUAL" } });
    await recordDifferences(db() as Db, run.id, new Map([["X-203", quote(9_500_000)]]) as never);
    const change = await db().priceChange.findFirstOrThrow({ where: { runId: run.id } });

    await applyPriceChanges(db() as Db, { ids: [change.id] }, operator);

    const after = await db().product.findUniqueOrThrow({ where: { id: product.id } });
    expect(after.extraSpecs).toMatchObject({ scraperPrice: { price: 10_000_000 } });
    expect((await db().variant.findUniqueOrThrow({ where: { id: variant.id } })).price).toBe(9_500_000);
  });
});

describe("setting a change aside", () => {
  beforeEach(resetDatabase);

  it("marks it ignored without touching the price, and records the operator", async () => {
    const operator = await actingOperator();
    const { variant } = await seedProduct();
    const run = await db().priceWatchRun.create({ data: { status: "RUNNING", trigger: "MANUAL" } });
    await recordDifferences(db() as Db, run.id, new Map([["X-203", quote(9_500_000)]]) as never);
    const change = await db().priceChange.findFirstOrThrow({ where: { runId: run.id } });

    const result = await ignorePriceChanges(db() as Db, { ids: [change.id] }, operator);
    expect(result.ignored).toBe(1);

    // Dismissal is not deletion. The row is the record that this difference was seen and rejected,
    // which is why it is not re-raised as a surprise on the next run.
    const row = await db().priceChange.findUniqueOrThrow({ where: { id: change.id } });
    expect(row.status).toBe("IGNORED");
    expect(row.appliedById).toBe(operator.adminUserId);
    expect((await db().variant.findUniqueOrThrow({ where: { id: variant.id } })).price).toBe(10_000_000);

    const lines = await db().adminAuditLog.findMany({ where: { action: "PRICE_CHANGES_IGNORED" } });
    expect(lines).toHaveLength(1);
  });
});

describe("the configuration", () => {
  beforeEach(resetDatabase);

  it("creates the singleton row under its fixed id, so two processes cannot make two schedules", async () => {
    const first = await savePriceWatchConfig(db() as Db, { enabled: true, mode: "INTERVAL", intervalMinutes: 360 } as never);
    expect(first.mode).toBe("INTERVAL");

    // Addressed by the constant, never created: a second save updates the same row. A `cuid()` here
    // would make "there is only one" a fact the schema cannot express.
    expect(await db().priceWatch.count()).toBe(1);
    expect((await db().priceWatch.findUniqueOrThrow({ where: { id: PRICE_WATCH_ID } })).intervalMinutes).toBe(360);
  });

  it("writes the first next-run time with the configuration, so a newly enabled watch does not fire at once", async () => {
    const saved = await savePriceWatchConfig(db() as Db, { enabled: true, mode: "INTERVAL", intervalMinutes: 60 } as never);
    const row = await db().priceWatch.findUniqueOrThrow({ where: { id: PRICE_WATCH_ID } });
    expect(row.nextRunAt).toBeInstanceOf(Date);
    expect(row.nextRunAt!.getTime()).toBeGreaterThan(saved.at.getTime());
  });

  it("leaves no next-run time when the watch is switched off", async () => {
    await savePriceWatchConfig(db() as Db, { enabled: false, mode: "INTERVAL", intervalMinutes: 360 } as never);
    const row = await db().priceWatch.findUniqueOrThrow({ where: { id: PRICE_WATCH_ID } });
    expect(row.nextRunAt).toBeNull();
  });

  it("refuses a daily schedule with no time, because the rule needs two fields", async () => {
    // Not a decorator on either field: the pipe is handed `mode` without `dailyAt`.
    await expect(
      savePriceWatchConfig(db() as Db, { enabled: true, mode: "DAILY", intervalMinutes: 360 } as never),
    ).rejects.toThrow(/ساعت اجرا/);
  });
});

describe("a run that fails", () => {
  beforeEach(resetDatabase);

  /**
   * A client whose read of our catalogue rejects, so the check fails after the run row exists and
   * before it could write anything.
   *
   * This is the failure path driven deterministically rather than by unplugging the network. The
   * real fetch is the one step here that cannot be hand-built, and a test whose outcome depends on
   * whether dateesshop.com answered is a test that passes and fails for reasons that have nothing to
   * do with the code. The two properties under test are that a failure is *recorded* and that the
   * schedule survives it.
   */
  function dbWithFailingCatalogueRead(): Db {
    const real = db() as Db;
    return new Proxy(real, {
      get(target, prop, receiver) {
        if (prop === "product") {
          return { findMany: () => Promise.reject(new Error("CATALOGUE_UNREACHABLE")) };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as Db;
  }

  it("records a FAILED run carrying the message", async () => {
    const result = await runPriceWatchCheck(dbWithFailingCatalogueRead(), "MANUAL");

    expect(result.status).toBe("FAILED");
    expect(result.error).toBe("CATALOGUE_UNREACHABLE");

    const runs = await db().priceWatchRun.findMany();
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("FAILED");
    // The message is the whole reason the row exists. A failed check with no reason recorded is
    // indistinguishable from a watch that is switched off.
    expect(runs[0].error).toBe("CATALOGUE_UNREACHABLE");
    expect(runs[0].finishedAt).toBeInstanceOf(Date);
  });

  // The reason a failure does not clear the schedule. A watch that stopped checking because the
  // source was briefly unreachable would report itself as fine, and "it stopped" would have no cause
  // for anyone to look for.
  it("leaves the schedule exactly as it was", async () => {
    await savePriceWatchConfig(db() as Db, { enabled: true, mode: "INTERVAL", intervalMinutes: 360 } as never);
    const before = await db().priceWatch.findUniqueOrThrow({ where: { id: PRICE_WATCH_ID } });

    await runPriceWatchCheck(dbWithFailingCatalogueRead(), "SCHEDULE");

    const after = await db().priceWatch.findUniqueOrThrow({ where: { id: PRICE_WATCH_ID } });
    expect(after.enabled).toBe(true);
    expect(after.mode).toBe(before.mode);
    expect(after.intervalMinutes).toBe(before.intervalMinutes);
    expect(after.nextRunAt?.getTime()).toBe(before.nextRunAt!.getTime());
    // `lastRunAt` stays null as well. The run row is where a failure is recorded, and advancing the
    // watch's own "last run" on a check that found nothing would make a broken watch look like a
    // working one.
    expect(after.lastRunAt).toBeNull();
  });
});

/**
 * The queue's date range.
 *
 * A range is the only filter an operator can point at a time ("what changed last week", "what was
 * found while I was away"), and two properties have to hold for the answer to mean anything: the
 * bounds are honoured against `detectedAt` — the timestamp the table shows — and a range nobody
 * explains must not silently answer "nothing changed".
 */
describe("the review queue's date range", () => {
  beforeEach(resetDatabase);

  /** One finding with the detection time the operator picked. */
  const seedChange = async (detectedAt: Date, status: "PENDING" | "APPLIED" | "IGNORED" = "PENDING") => {
    const run = await db().priceWatchRun.create({ data: { status: "COMPLETED", trigger: "MANUAL" } });
    const row = await db().priceChange.create({
      data: {
        runId: run.id,
        variantId: `variant-${detectedAt.getTime()}`,
        productId: `product-${detectedAt.getTime()}`,
        sku: `SKU-${detectedAt.getTime()}`,
        productName: "یخچال فریزر",
        colorName: "مشکی",
        fromPrice: 10_000_000,
        toPrice: 9_500_000,
        sourceUrl: "https://dateesshop.com/product/x",
        status,
        detectedAt,
      },
    });
    return row.sku;
  };

  it("returns only the findings detected inside the range", async () => {
    const morning = await seedChange(new Date("2026-10-01T06:00:00.000Z"));
    const evening = await seedChange(new Date("2026-10-01T18:00:00.000Z"));
    await seedChange(new Date("2026-10-05T12:00:00.000Z"));

    const page = await listPriceChanges(db() as Db, {
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-02T00:00:00.000Z",
      page: 1,
      size: 50,
    });

    expect(page.total).toBe(2);
    // Newest first, as the queue renders it.
    expect(page.rows.map((row) => row.sku)).toEqual([evening, morning]);
  });

  it("keeps the other bound when only one end is sent", async () => {
    const before = await seedChange(new Date("2026-10-01T06:00:00.000Z"));
    const after = await seedChange(new Date("2026-10-05T12:00:00.000Z"));

    const page = await listPriceChanges(db() as Db, { from: "2026-10-03T00:00:00.000Z", page: 1, size: 50 });
    expect(page.rows.map((row) => row.sku)).toEqual([after]);

    const later = await listPriceChanges(db() as Db, { to: "2026-10-03T00:00:00.000Z", page: 1, size: 50 });
    expect(later.rows.map((row) => row.sku)).toEqual([before]);
  });

  it("filters on the time the table shows, not on when it was applied", async () => {
    const row = await seedChange(new Date("2026-10-01T06:00:00.000Z"));
    // Detected in October, applied in November: the range must still find it, because the column the
    // operator reads is "زمان شناسایی".
    await db().priceChange.updateMany({
      where: { sku: row },
      data: { status: "APPLIED", appliedAt: new Date("2026-11-04T09:00:00.000Z") },
    });

    const page = await listPriceChanges(db() as Db, {
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-02T00:00:00.000Z",
      page: 1,
      size: 50,
    });
    expect(page.rows.map((r) => r.sku)).toEqual([row]);
  });

  it("combines with the status filter rather than replacing it", async () => {
    const pending = await seedChange(new Date("2026-10-01T06:00:00.000Z"), "PENDING");
    await seedChange(new Date("2026-10-01T07:00:00.000Z"), "APPLIED");

    const page = await listPriceChanges(db() as Db, {
      status: "PENDING",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-02T00:00:00.000Z",
      page: 1,
      size: 50,
    });
    expect(page.rows.map((r) => r.sku)).toEqual([pending]);
  });

  // An inverted range without this rule is not an error, it is an empty page — and an empty queue is
  // the answer this screen must never give by accident.
  it("rejects a range whose start is after its end, rather than showing nothing", async () => {
    await seedChange(new Date("2026-10-01T06:00:00.000Z"));

    await expect(
      listPriceChanges(db() as Db, {
        from: "2026-10-05T00:00:00.000Z",
        to: "2026-10-01T00:00:00.000Z",
        page: 1,
        size: 50,
      }),
    ).rejects.toThrow("پیش از تاریخ پایان");
  });

  it("returns nothing when no row falls in the range", async () => {
    await seedChange(new Date("2026-10-01T06:00:00.000Z"));

    const page = await listPriceChanges(db() as Db, {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-02T00:00:00.000Z",
      page: 1,
      size: 50,
    });
    expect(page.rows).toHaveLength(0);
    expect(page.total).toBe(0);
  });
});

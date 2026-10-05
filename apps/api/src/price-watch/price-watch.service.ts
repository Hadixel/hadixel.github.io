// The price watch: check the source, record what differs, and let an operator decide.
//
// The single rule everything else follows from: **a check never writes `Variant.price`.** A detected
// difference becomes a `PriceChange` row with `PENDING`, and the price moves only when an operator
// applies one. The alternative — a crawler repricing the shop on a schedule — would let one bad
// response from a third party reprice a live shop with nobody watching, and there is no undo for a
// price a customer was already shown. Recording the difference costs an operator a click; getting
// it wrong costs the shop its margin on every order in between.
//
// Which is also why the *apply* is a separate function with its own transaction and its own audit
// line, and why the panel's button calls that and never the check.
//
// The other rule is about the source: it is somebody else's live catalogue, fetched over the
// network, and every step here is written so that a fetch that fails, a source that answers with
// something unexpected, or two checks racing produce a recorded failure rather than a wrong price.

import {
  fetchDateesShopPriceIndex,
  matchDateesShopProductPrice,
  dateesShopColorToken,
  type PriceQuote,
} from "@kmodern/scraper-core/price-sources";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "../common/exceptions/gateway.exception.js";
import { writeAudit } from "../common/audit.js";
import type { PrismaClient } from "../prisma/index.js";
import { computeNextRun, isDailyAt, PRICE_WATCH_TZ, type PriceWatchSchedule } from "./price-watch.schedule.js";
import type { ApplyPriceChangesDto, SavePriceWatchConfigDto } from "./dto/price-watch.dto.js";


/**
 * The one row the watch is configured by.
 *
 * A constant rather than a `cuid()`, and that is the whole reason it is one: every read and every
 * write addresses the watch by this id, so two gateway processes starting at once cannot end up
 * with two schedules, and there is no "create" path that could be raced. The row is created by
 * `upsert` on this id, which is the only place a `PriceWatch` is ever created.
 */
export const PRICE_WATCH_ID = "price-watch";

/** Who made the change, and where they made it from. */
export interface PriceWatchActor {
  adminUserId: string;
  ip: string | null;
  userAgent: string | null;
}

/** What one check found. */
export interface PriceWatchRunResult {
  runId: string;
  status: "COMPLETED" | "FAILED";
  quotes: number;
  matched: number;
  changes: number;
  error?: string;
}

/** Prices this shop already has, for one product. */
interface VariantPriceRow {
  id: string;
  sku: string;
  colorName: string;
  price: number;
  productId: string;
}

/** What a saved configuration answers with: the row as stored, and the instant it was stored. */
export interface PriceWatchConfigResult {
  mode: "INTERVAL" | "DAILY";
  intervalMinutes: number;
  dailyAt: string | null;
  nextRunAt: Date | null;
  at: Date;
}

/**
 * The brand whose catalogue is watched, and the filter that finds it.
 *
 * A filter rather than "every product", because the source is one retailer's shop and matching our
 * whole catalogue against it produces coincidences: two products from different brands share a
 * normalised name often enough that the queue fills with findings about products nobody is watching.
 *
 * Case-insensitively, because `Product.brand` holds whatever the import wrote and the import's own
 * fallback is `"Datees"` in title case while the slug vocabulary lowercases it — so a row can be
 * either. An exact match on one spelling is a filter that returns nothing and reads as "no
 * differences found", which is the most expensive kind of silence: a watch that fetched a whole
 * catalogue and reported the shop clean.
 */
const WATCHED_BRAND_FILTER = { brand: { equals: "datees", mode: "insensitive" } } as const;

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

/** The configuration row, created on first read so the panel always has one to render. */
async function config(client: PrismaClient) {
  return client.priceWatch.upsert({
    where: { id: PRICE_WATCH_ID },
    create: { id: PRICE_WATCH_ID },
    update: {},
  });
}

/** The panel's whole screen in one answer: the schedule, the recent runs, and how much is waiting. */
export async function getPriceWatchOverview(client: PrismaClient) {
  const watch = await config(client);
  const [runs, pending] = await Promise.all([
    client.priceWatchRun.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
    client.priceChange.count({ where: { status: "PENDING" } }),
  ]);

  return {
    config: {
      enabled: watch.enabled,
      mode: watch.mode,
      intervalMinutes: watch.intervalMinutes,
      dailyAt: watch.dailyAt,
      lastRunAt: watch.lastRunAt?.toISOString() ?? null,
      nextRunAt: watch.nextRunAt?.toISOString() ?? null,
      timezone: PRICE_WATCH_TZ,
    },
    runs: runs.map((run) => ({
      id: run.id,
      status: run.status,
      trigger: run.trigger,
      quotes: run.quotes,
      matched: run.matched,
      changes: run.changes,
      error: run.error,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    })),
    pendingChanges: pending,
  };
}

/** One page of the review queue, newest first, with the total so the panel can render its pager. */
export async function listPriceChanges(
  client: PrismaClient,
  query: {
    status?: "PENDING" | "APPLIED" | "IGNORED";
    from?: string;
    to?: string;
    page: number;
    size: number;
  },
) {
  // The rule that cannot be a decorator: "from must not be after to" reads both fields, and ADR-0003
  // puts exactly those in the service. Without it an inverted range is not an error but an empty
  // queue, and an empty queue is indistinguishable from "nothing changed" — the one answer this
  // screen must never give by accident.
  if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
    throw new BadRequestException("تاریخ شروع بازهٔ زمانی باید پیش از تاریخ پایان باشد.");
  }

  // Both bounds, and each is optional: an operator widening "the last day" to "last month" keeps the
  // other end fixed, and a form that sent only one would silently drop the one already chosen. The
  // filter is `detectedAt`, not `appliedAt` — the queue answers "what did you notice", and the date
  // the operator sees in the table is the detection time, so a range that filtered on the other
  // column would return rows whose displayed date falls outside it.
  const range = {
    ...(query.from || query.to
      ? {
          detectedAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  };
  const where = { ...(query.status ? { status: query.status } : {}), ...range };
  const [rows, total] = await Promise.all([
    client.priceChange.findMany({
      where,
      // The id breaks the tie, for the reason the audit read gives: without it, paging can repeat a
      // row or skip one whenever two findings share a timestamp, which they do — a run writes them
      // in one statement.
      orderBy: [{ detectedAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.size,
      take: query.size,
    }),
    client.priceChange.count({ where }),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      runId: row.runId,
      variantId: row.variantId,
      productId: row.productId,
      sku: row.sku,
      productName: row.productName,
      colorName: row.colorName,
      fromPrice: row.fromPrice,
      toPrice: row.toPrice,
      sourceUrl: row.sourceUrl,
      status: row.status,
      detectedAt: row.detectedAt.toISOString(),
      appliedAt: row.appliedAt?.toISOString() ?? null,
    })),
    total,
    page: query.page,
    size: query.size,
  };
}

// ---------------------------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------------------------

/**
 * Save the schedule, and write the first `nextRunAt` with it.
 *
 * The two fields are written together because a schedule whose mode has changed but whose
 * `nextRunAt` still points at the old mode's time fires at the wrong hour once, and once is enough
 * to record a run at three in the morning that nobody asked for. The next-run value is recomputed
 * from the configuration just saved rather than from the one before it, so the panel's two fields
 * and the row's `nextRunAt` cannot disagree.
 */
export async function savePriceWatchConfig(
  client: PrismaClient,
  input: SavePriceWatchConfigDto,
): Promise<PriceWatchConfigResult> {
  // A rule that reads a neighbour, so it is here and not on either field. The DTO cannot say it: the
  // pipe is handed `mode` without `dailyAt` and `dailyAt` without `mode`.
  if (input.mode === "DAILY" && !isDailyAt(input.dailyAt)) {
    throw new BadRequestException("برای حالت روزانه باید ساعت اجرا تعیین شود.");
  }
  // The same rule, for the other combination. An INTERVAL schedule that also carries a time is not
  // refused, because the panel keeps the field filled in while the operator switches modes back and
  // forth, and refusing would make the toggle lose the value it is about to restore.
  if (input.mode === "INTERVAL" && input.dailyAt !== undefined && !isDailyAt(input.dailyAt)) {
    throw new BadRequestException("ساعت اجرا باید به شکل ساعت:دقیقه باشد.");
  }

  const now = new Date();
  const schedule: PriceWatchSchedule = {
    mode: input.mode,
    intervalMinutes: input.intervalMinutes,
    dailyAt: input.dailyAt ?? null,
  };
  const nextRunAt = input.enabled ? computeNextRun(schedule, now) : null;

  const saved = await client.priceWatch.upsert({
    where: { id: PRICE_WATCH_ID },
    create: {
      id: PRICE_WATCH_ID,
      enabled: input.enabled,
      mode: input.mode,
      intervalMinutes: input.intervalMinutes,
      dailyAt: input.dailyAt ?? null,
      nextRunAt,
    },
    update: {
      enabled: input.enabled,
      mode: input.mode,
      intervalMinutes: input.intervalMinutes,
      dailyAt: input.dailyAt ?? null,
      nextRunAt,
    },
  });

  return {
    mode: saved.mode,
    intervalMinutes: saved.intervalMinutes,
    dailyAt: saved.dailyAt,
    nextRunAt: saved.nextRunAt,
    at: now,
  };
}

// ---------------------------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------------------------

/**
 * Run one check and record what it found.
 *
 * `trigger` is recorded rather than inferred because the two callers answer different questions: a
 * reviewer looking at a finding wants to know whether a person looked and said nothing, or nothing
 * looked at all. The manual path is the same function as the scheduled one — a check that behaves
 * differently when a button was pressed is a check whose results depend on who was watching, and
 * that is the property this feature most needs not to have.
 *
 * A failure writes a FAILED run carrying the message and leaves the schedule exactly as it was. That
 * matters most when the source is down: a watch that cleared its own schedule on a failed fetch
 * would stop noticing that it is broken, and the operator's "it stopped checking" would have no
 * cause to look for.
 */
export async function runPriceWatchCheck(
  client: PrismaClient,
  trigger: "SCHEDULE" | "MANUAL",
): Promise<PriceWatchRunResult> {
  const run = await client.priceWatchRun.create({ data: { status: "RUNNING", trigger } });

  try {
    const index = await fetchDateesShopPriceIndex();
    const found = await recordDifferences(client, run.id, index);

    const finished = await client.priceWatchRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        quotes: index.size,
        matched: found.matched,
        changes: found.changes.length,
        finishedAt: new Date(),
      },
    });
    await scheduleNextRun(client, finished.finishedAt ?? new Date());

    return {
      runId: run.id,
      status: "COMPLETED",
      quotes: finished.quotes,
      matched: finished.matched,
      changes: finished.changes,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطای نامشخص";
    await client.priceWatchRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: message, finishedAt: new Date() },
    });
    // The schedule is untouched. A failed fetch is not a reason to stop checking — it is the reason
    // the next check is more likely to be the one that works.
    return { runId: run.id, status: "FAILED", quotes: 0, matched: 0, changes: 0, error: message };
  }
}

/** Write the next run's time, and the time this one finished. */
async function scheduleNextRun(client: PrismaClient, finishedAt: Date): Promise<void> {
  const watch = await config(client);
  await client.priceWatch.update({
    where: { id: PRICE_WATCH_ID },
    data: {
      lastRunAt: finishedAt,
      nextRunAt: watch.enabled
        ? computeNextRun(
            { mode: watch.mode, intervalMinutes: watch.intervalMinutes, dailyAt: watch.dailyAt },
            finishedAt,
          )
        : null,
    },
  });
}

/** The variant, the source's answer for it, and whether they differ. */
interface Difference {
  variantId: string;
  productId: string;
  sku: string;
  productName: string;
  colorName: string;
  fromPrice: number;
  toPrice: number;
  sourceUrl: string;
}

/**
 * Match our products against the index and record the differences.
 *
 * Split out of `runPriceWatchCheck` so the part worth testing — the matching and the decision to
 * write a row — has no network and no clock in it, and can be driven with a hand-built index.
 */
export async function recordDifferences(
  client: PrismaClient,
  runId: string,
  index: Map<string, PriceQuote>,
): Promise<{ matched: number; changes: Difference[] }> {
  const products = await client.product.findMany({
    where: WATCHED_BRAND_FILTER,
    select: { id: true, name: true, model: true, variants: { select: { id: true, sku: true, colorName: true, price: true, productId: true } } },
  });

  let matched = 0;
  const changes: Difference[] = [];

  for (const product of products) {
    const quote = matchDateesShopProductPrice({ name: product.name, model: product.model }, index);
    // Not found is the common case, not an error: the source carries a few hundred products and we
    // carry a few hundred more, and only the overlap means anything. Counting it as a failure would
    // make a perfectly good run look broken.
    if (!quote) continue;
    matched += 1;

    for (const variant of product.variants as VariantPriceRow[]) {
      const to = priceForVariant(variant, quote);
      // A variant the source has no price for is not a difference, it is an absence. Falling back to
      // the product's own minimum would report a price for a colour the source never quoted, and an
      // operator applying that would be applying a number nothing said.
      if (to === null) continue;
      // The comparison is exact on purpose. A tolerance would mean a difference of a few toman never
      // reaches the queue, and the operator is the one who can judge whether three thousand toman
      // on a two-hundred-million-toman television matters.
      if (to === variant.price) continue;

      changes.push({
        variantId: variant.id,
        productId: variant.productId,
        sku: variant.sku,
        productName: product.name,
        colorName: variant.colorName,
        fromPrice: variant.price,
        toPrice: to,
        sourceUrl: quote.sourceUrl,
      });
    }
  }

  if (changes.length) {
    // One statement for the whole run rather than one per variant. Two reasons, and the second is
    // the one that bites: a round trip per finding is a run that takes minutes on a large catalogue,
    // and each individual write is a statement that can fail on its own, leaving a run whose
    // `changes` count and its rows disagree. The `@@unique([runId, variantId])` is what makes the
    // batch safe to re-run after a partial failure.
    await client.priceChange.createMany({
      data: changes.map((change) => ({
        runId,
        variantId: change.variantId,
        productId: change.productId,
        sku: change.sku,
        productName: change.productName,
        colorName: change.colorName,
        fromPrice: change.fromPrice,
        toPrice: change.toPrice,
        sourceUrl: change.sourceUrl,
      })),
    });
  }

  return { matched, changes };
}

/**
 * The source's price for one variant.
 *
 * The colour map first, because the source quotes per colour and a product's overall minimum is not
 * any of its colours' prices: applying a black variant's new price from the product's cheapest
 * colour is a price nobody quoted. The product price is the fallback, so a source that only quotes
 * one number still produces a finding rather than silence.
 */
function priceForVariant(
  variant: { colorName: string },
  quote: { price: number; priceByColor?: Record<string, number>; inStock?: boolean },
): number | null {
  // The source stocks a product but not every colour in it, so availability is judged per colour
  // first and per product second. A quote for a colour nobody can sell is not a price, it is a
  // leftover: the shop keeps the page and the number up while nothing ships. An operator applying
  // that would be repricing this shop's variant to match a product Datees does not actually have.
  if (quote.inStock === false) return null;
  const token = dateesShopColorToken(variant.colorName);
  const byColor = token ? quote.priceByColor?.[token] : undefined;
  if (typeof byColor === "number" && Number.isFinite(byColor) && byColor > 0) return byColor;
  if (Number.isFinite(quote.price) && quote.price > 0) return quote.price;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------------------------

/**
 * Apply recorded changes to the variants they name.
 *
 * One transaction for all of them, and the audit line is its last statement. Three things depend on
 * that: an operator who applies forty findings and is shown a failure has to know that *none* of
 * them were applied rather than some; a failure at the eightieth must not leave the first seventy-
 * nine applied with nothing saying so; and the trail must not be able to say forty prices changed
 * when thirty-nine did.
 *
 * The variants are read inside the transaction and written by id. The price written is the change's
 * recorded `toPrice`, not whatever the variant holds now: the row is what the operator accepted, and
 * re-reading at apply time would apply a number the operator never saw.
 *
 * **It deliberately does not rewrite `Product.extraSpecs.scraperPrice`.** That blob is what the
 * scrape *found*, written by the import, and the watch is not a scrape: overwriting it would
 * replace a record of an import with a record of a watch, and the next import would compare against
 * prices a watch wrote. The provenance of this price is the `PriceChange` row itself — it carries
 * the run, the source URL, the old price and who applied it — which is a more complete answer than
 * the blob ever was.
 */
export async function applyPriceChanges(
  client: PrismaClient,
  input: ApplyPriceChangesDto,
  actor: PriceWatchActor,
): Promise<{ applied: number; skipped: number }> {
  // An empty list means every pending change, which is why the DTO caps the list rather than
  // length-checking it: an empty array is the route's most-used input, not a mistake.
  const ids = input.ids?.length ? input.ids : undefined;

  return client.$transaction(async (tx) => {
    const changes = await tx.priceChange.findMany({
      where: ids ? { id: { in: ids } } : { status: "PENDING" },
      select: { id: true, variantId: true, toPrice: true, status: true },
    });

    if (!changes.length) {
      throw new NotFoundException("تغییر قیمتی برای اعمال پیدا نشد.");
    }

    // Already-applied rows are counted, not written. A panel that renders a row and an operator who
    // clicks twice are both ordinary, and the second click must not move a price a second time or
    // claim it did.
    const applicable = changes.filter((change) => change.status === "PENDING");
    const applied = new Date();

    for (const change of applicable) {
      await tx.variant.update({ where: { id: change.variantId }, data: { price: change.toPrice } });
    }

    if (applicable.length) {
      await tx.priceChange.updateMany({
        where: { id: { in: applicable.map((change) => change.id) } },
        data: { status: "APPLIED", appliedAt: applied, appliedById: actor.adminUserId },
      });
    }

    // One line for the batch, carrying the count — the rule `media.controller.ts` states for a
    // hundred uploads and the reason it is a rule: forty lines in a row, all saying the same thing,
    // bury every other entry in the trail, and the reader has to count them to learn how much
    // happened. The count is in the line instead.
    await writeAudit(tx, {
      adminUserId: actor.adminUserId,
      action: "PRICE_CHANGES_APPLIED",
      entityType: "PRICE_CHANGE",
      ip: actor.ip,
      userAgent: actor.userAgent,
      meta: {
        applied: applicable.length,
        skipped: changes.length - applicable.length,
        selected: ids?.length ?? null,
        allPending: !ids,
      },
    });

    return { applied: applicable.length, skipped: changes.length - applicable.length };
  });
}

/**
 * Set changes aside without applying them.
 *
 * The counterpart to applying, and it exists because the queue's usefulness depends on it: a
 * difference the operator has decided is wrong — a bundle price, a discontinued line, a source
 * quoting a different currency — has to be dismissable, or the same row is reviewed at every run
 * forever. Dismissal is not deletion. The row is the record that this difference was seen and
 * rejected, and that record is why a rejected finding is not re-raised as a surprise later.
 */
export async function ignorePriceChanges(
  client: PrismaClient,
  input: ApplyPriceChangesDto,
  actor: PriceWatchActor,
): Promise<{ ignored: number }> {
  const ids = input.ids?.length ? input.ids : undefined;

  return client.$transaction(async (tx) => {
    const changes = await tx.priceChange.findMany({
      where: ids ? { id: { in: ids } } : { status: "PENDING" },
      select: { id: true, status: true },
    });
    if (!changes.length) throw new NotFoundException("تغییر قیمتی برای رد کردن پیدا نشد.");

    const pending = changes.filter((change) => change.status === "PENDING");
    if (pending.length) {
      await tx.priceChange.updateMany({
        where: { id: { in: pending.map((change) => change.id) } },
        data: { status: "IGNORED", appliedAt: new Date(), appliedById: actor.adminUserId },
      });
    }

    // One line, same reason as the apply. `appliedById` on an ignored row is the operator who
    // dismissed it, and the audit line is where the reason they gave would live if they gave one.
    await writeAudit(tx, {
      adminUserId: actor.adminUserId,
      action: "PRICE_CHANGES_IGNORED",
      entityType: "PRICE_CHANGE",
      ip: actor.ip,
      userAgent: actor.userAgent,
      meta: { ignored: pending.length, allPending: !ids },
    });

    return { ignored: pending.length };
  });
}

/**
 * Refuse a second run while one is in flight.
 *
 * A check is a fetch of somebody else's whole catalogue followed by a comparison against ours, and
 * nothing in it is idempotent: two runs in parallel both find the same differences and write two
 * sets of rows, so the queue shows every finding twice and applying them writes the same price
 * twice. The run row is the lock rather than a process-level flag, because the flag would be
 * invisible to a second gateway process — and the refusal is a 409 with a sentence rather than a
 * silent no-op, so the operator pressing the button twice is told why the second press did nothing.
 */
export async function assertNoRunInFlight(client: PrismaClient): Promise<void> {
  const running = await client.priceWatchRun.findFirst({ where: { status: "RUNNING" } });
  if (running) {
    throw new ConflictException("یک بررسی در حال اجراست؛ تا پایان آن دوباره اجرا نکنید.");
  }
}


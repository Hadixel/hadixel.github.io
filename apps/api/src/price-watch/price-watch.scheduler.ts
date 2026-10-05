// The ticker.
//
// A plain `setInterval` and a provider implementing `OnModuleInit`/`OnModuleDestroy`, which is
// deliberate on both counts.
//
// The interval: this repo has no `@nestjs/schedule`, no `node-cron`, no `bull` and no `agenda`, and
// adding one to say "every thirty seconds" is a dependency, a lockfile entry and a version to keep
// current in exchange for a call the runtime already makes. Thirty seconds is a tick, not a
// schedule — the *schedule* lives in `PriceWatch.nextRunAt`, and this only asks whether it has
// arrived. That is also why the tick is short: the coarseness the operator experiences is the
// schedule's own interval, not this one's.
//
// The provider: it is declared by the feature module rather than by `AppModule`, because that
// module's header says there are no providers in the composition root — a provider constructed
// there is constructed outside the wiring layer, which is how a dependency becomes reachable from a
// module that never declared it. The feature owns its own timer and can be reasoned about, and
// tested, as one thing.
//
// The interval handle is kept so it can be cleared. A `setInterval` nobody clears holds the event
// loop open forever, and the gateway is a process that has to be able to stop for a deploy.

import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { PrismaClient } from "../prisma/index.js";
import { isDue } from "./price-watch.schedule.js";
import { PRICE_WATCH_ID, runPriceWatchCheck } from "./price-watch.service.js";

/** How often the ticker asks whether the watch is due. Not the watch's interval — see the header. */
const TICK_MS = 30_000;

@Injectable()
export class PriceWatchScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  /**
   * The in-process guard, and it is a flag rather than a lock.
   *
   * A run takes seconds: it fetches somebody else's whole catalogue over the network. Without this,
   * a watch whose interval is shorter than one run gets a second tick before the first finishes, and
   * the two write two sets of `PriceChange` rows for the same variants — the queue showing every
   * finding twice, and applying them writing the same price twice.
   *
   * A flag and not a database lock on purpose: a database lock would also cover a *second gateway
   * process*, which is the case that actually loses data, and it would need a row to hold it. The
   * honest split is that the flag protects this process and `PriceWatchRun`'s own `RUNNING` row
   * makes a cross-process overlap visible — the service refuses a manual run while one is in flight,
   * and a scheduled tick that finds one leaves it alone rather than starting a second. Two runs can
   * therefore still overlap across processes, and what prevents duplicate findings there is the
   * `@@unique([runId, variantId])` on the rows themselves.
   */
  private running = false;

  constructor(@Inject(DATA_CLIENT) private readonly db: PrismaClient) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_MS);
    // A timer must not hold the process open on its own. Without this a gateway shutting down for a
    // deploy waits out the interval, and the deploy's timeout is what notices.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Ask the row whether it is due, and run if it is. Never throws: a tick is not a request. */
  private async tick(): Promise<void> {
    if (this.running) return;
    try {
      const watch = await this.db.priceWatch.findUnique({ where: { id: PRICE_WATCH_ID } });
      // No row, or switched off, or nothing scheduled: nothing to do. This is the common case on a
      // fresh install, and it is the reason the tick is cheap rather than a row write.
      if (!watch?.enabled) return;
      if (!isDue(watch.nextRunAt, new Date())) return;
      // A run in flight in another process leaves the schedule alone, and its own `nextRunAt` will
      // be rewritten when it finishes. Skipping is the only safe move: running anyway is the
      // duplicate-findings case.
      const inFlight = await this.db.priceWatchRun.findFirst({ where: { status: "RUNNING" } });
      if (inFlight) return;

      this.running = true;
      await runPriceWatchCheck(this.db, "SCHEDULE");
    } catch {
      // A tick that throws would reject into an interval callback, where nothing is listening, and
      // the failure would be a line in a log with no run row to explain it. The check itself records
      // its own failures as FAILED runs; what reaches this handler is a database or wiring problem,
      // and the next tick tries again.
    } finally {
      this.running = false;
    }
  }
}

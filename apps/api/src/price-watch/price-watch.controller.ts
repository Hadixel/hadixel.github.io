// The price watch, as the panel reaches it.
//
// Five routes, and the split between them is the feature. Three change nothing an operator owns
// beyond a schedule (`POST /config`, `POST /run`, the two reads) and one changes prices
// (`POST /changes/apply`) — and that one is the only route in the shop where a button can reprice
// the catalogue, which is why it is its own route with its own transaction and its own audit line
// rather than a flag on the run route.
//
// Every route is an operator's, so every one says so first: `requireAdmin` before anything else,
// because a request that cannot be attributed to an operator has no business reading the shop's
// prices, scheduling a fetch, or writing them.
//
// The origin check is not here. It is `OriginGuard`, registered in the composition root over every
// mutating method — see `common/guards/origin.guard.ts` — so a mutating route added next year is
// covered by being a write. Re-implementing it per controller is the thing that guard exists to
// have ended.

import { Body, Controller, Get, Inject, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service.js";
import { requireAdmin } from "../auth/identity.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { PrismaClient } from "../prisma/index.js";
import {
  ApplyPriceChangesDto,
  IgnorePriceChangesDto,
  PriceChangesQueryDto,
  SavePriceWatchConfigDto,
} from "./dto/price-watch.dto.js";
import {
  applyPriceChanges,
  assertNoRunInFlight,
  getPriceWatchOverview,
  ignorePriceChanges,
  listPriceChanges,
  runPriceWatchCheck,
  savePriceWatchConfig,
  type PriceWatchActor,
} from "./price-watch.service.js";

@Controller("price-watch")
export class PriceWatchController {
  constructor(
    private readonly auth: AuthService,
    @Inject(DATA_CLIENT) private readonly db: PrismaClient,
  ) {}

  /** The whole screen in one answer: the schedule, the last five runs, and how much is waiting. */
  @Get()
  async overview(@Req() req: Request) {
    await requireAdmin(this.auth, req);
    return getPriceWatchOverview(this.db);
  }

  /** One page of the review queue, optionally filtered to one status and one date range. */
  @Get("changes")
  async changes(@Req() req: Request, @Query() query: PriceChangesQueryDto) {
    await requireAdmin(this.auth, req);
    return listPriceChanges(this.db, {
      status: query.status,
      from: query.from,
      to: query.to,
      page: query.page,
      size: query.size,
    });
  }

  /**
   * Save the schedule.
   *
   * `nextRunAt` is written by the gateway rather than sent by the panel, because it is derived from
   * the schedule and the clock. A panel that sent its own would be a second answer to "when is this
   * due", computed in a process whose timezone is not Tehran's.
   */
  @Post("config")
  async saveConfig(@Req() req: Request, @Body() body: SavePriceWatchConfigDto) {
    await requireAdmin(this.auth, req);
    return savePriceWatchConfig(this.db, body);
  }

  /**
   * Run the check now.
   *
   * The same function the scheduler calls, with the trigger recorded — see `runPriceWatchCheck` for
   * why a manual run is not a different kind of run. The refusal for a run already in flight is
   * here rather than inside the service because it is a question about a *concurrent* caller, and
   * the service is also reached by the tick, which must not be refused by its own guard.
   */
  @Post("run")
  async run(@Req() req: Request) {
    // Only the permission check: a run carries no operator of its own, because what it records is
    // the watch's schedule and its result. An operator id is written where one is *decided* — the
    // apply and the ignore, which pass `actorOf` — and passing one here would invent a decision.
    await requireAdmin(this.auth, req);
    await assertNoRunInFlight(this.db);
    return runPriceWatchCheck(this.db, "MANUAL");
  }

  /**
   * Apply recorded changes: the named ones, or every pending one when `ids` is empty.
   *
   * The only route here that writes `Variant.price`, and the one that writes the audit line.
   */
  @Post("changes/apply")
  async apply(@Req() req: Request, @Body() body: ApplyPriceChangesDto) {
    const admin = await requireAdmin(this.auth, req);
    return applyPriceChanges(this.db, body, actorOf(admin.id, req));
  }

  /** Set changes aside. The same body as the apply, and the same reason it is a separate route. */
  @Post("changes/ignore")
  async ignore(@Req() req: Request, @Body() body: IgnorePriceChangesDto) {
    const admin = await requireAdmin(this.auth, req);
    return ignorePriceChanges(this.db, body, actorOf(admin.id, req));
  }
}

/**
 * The operator and where they came from, for the audit columns.
 *
 * The same shape the scraper controller records, and the reason it is here rather than in the
 * service is that the service is a plain function: a caller that reaches it from a test has no
 * request, and one that has a request should not be able to invent an operator id.
 */
function actorOf(adminUserId: string, req: Request): PriceWatchActor {
  const first = (value: string | string[] | undefined): string | null =>
    (Array.isArray(value) ? value[0] : value) ?? null;
  return {
    adminUserId,
    ip: first(req.headers["x-forwarded-for"]),
    userAgent: first(req.headers["user-agent"]),
  };
}

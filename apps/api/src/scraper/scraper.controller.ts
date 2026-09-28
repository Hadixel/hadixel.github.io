// The panel's scraper, as the gateway serves it.
//
// Two routes, and the split between them is the whole of this controller. `POST /scraper/import`
// changes the catalogue, so it owns a transaction and the audit line inside it. `POST /scraper/actions`
// changes nothing — an operator starting a scrape, cancelling one, or applying a price list to the
// review snapshot — and exists so that those three lines are written through `writeAudit` by the one
// caller that should, rather than by three route handlers in the panel each with its own copy of the
// insert and its own decision to swallow the failure.
//
// Both are operator routes and both say so first. `requireAdmin` before anything else, because a
// request that cannot be attributed to an operator has no business writing to this shop's catalogue
// or to its trail.
//
// The origin check is not here. It is `OriginGuard`, registered in the composition root over every
// mutating method — see `common/guards/origin.guard.ts` — so a route added next year is covered by
// being a write. Re-implementing it per controller is the thing that guard exists to have ended.

import { Body, Controller, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service.js";
import { requireAdmin } from "../auth/identity.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { ImportCatalogDto } from "./dto/import-catalog.dto.js";
import { RecordScraperActionDto } from "./dto/scraper-action.dto.js";
import { importScrapedCatalog, recordScraperAction, type ScraperActor } from "./scraper.service.js";

@Controller("scraper")
export class ScraperController {
  constructor(
    private readonly auth: AuthService,
    @Inject(DATA_CLIENT) private readonly db: PrismaClient,
  ) {}

  /**
   * Import the reviewed items — all of them or none.
   *
   * The transaction is the service's, and it is why this is one route: a hundred products, a hundred
   * variants, and a rule that a failure at the eightieth leaves nothing behind. Splitting it into
   * "here is the catalogue" and "here is each product" would be a hundred round trips and a hundred
   * chances to be interrupted.
   */
  @Post("import")
  async importCatalog(@Req() req: Request, @Body() body: ImportCatalogDto) {
    const admin = await requireAdmin(this.auth, req);
    return importScrapedCatalog(this.db, body, actorOf(admin.id, req));
  }

  /** Record an action that changed no row, through the one audit helper. */
  @Post("actions")
  async recordAction(@Req() req: Request, @Body() body: RecordScraperActionDto) {
    const admin = await requireAdmin(this.auth, req);
    return recordScraperAction(this.db, body, actorOf(admin.id, req));
  }
}

/**
 * The operator and where they came from, for the audit columns.
 *
 * The same shape the orders controller records, and the reason it is here rather than in the service
 * is that the service is a plain function: a caller that reaches it from a test has no request, and
 * one that has a request should not be able to invent an operator id.
 */
function actorOf(adminUserId: string, req: Request): ScraperActor {
  const first = (value: string | string[] | undefined): string | null =>
    (Array.isArray(value) ? value[0] : value) ?? null;
  return {
    adminUserId,
    ip: first(req.headers["x-forwarded-for"]),
    userAgent: first(req.headers["user-agent"]),
  };
}

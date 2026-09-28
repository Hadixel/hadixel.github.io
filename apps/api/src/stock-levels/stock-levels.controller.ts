// Stock, as the panel's inventory page reads it.
//
// One read, and it is a read rather than a page's own query because the page's question is not "the
// variants" — it is "the variants, the line they are judged against, and how many are below it", and
// a page that fetched the line from the settings table and compared the rows itself was holding both
// halves of one rule in two files.
//
// It needs an operator because the levels are the shop's book: what it has, what it has promised and
// what it has sold.

import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service.js";
import { requireAdmin } from "../auth/identity.js";
import { StockLevelQueryDto } from "./dto/stock-levels.dto.js";
import { StockLevelsService, type StockLevelPage } from "./stock-levels.service.js";

@Controller("stock-levels")
export class StockLevelsController {
  constructor(
    private readonly auth: AuthService,
    private readonly stock: StockLevelsService,
  ) {}

  /**
   * The variant list, emptiest first, paged, with the low-stock line and the count below it.
   *
   * The threshold comes back with the rows rather than being fetched separately, because the number
   * the header prints and the number each row's badge is decided by have to be the same number. Two
   * reads of one setting is two answers to "where is the line", and a setting changed between them
   * gives a page that says "low stock: 3" above rows flagged against 5.
   */
  @Get()
  async list(@Req() req: Request, @Query() query: StockLevelQueryDto): Promise<StockLevelPage> {
    await requireAdmin(this.auth, req);
    return this.stock.list({ q: query.q, page: query.page, size: query.size });
  }
}

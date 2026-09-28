// Customers, at the operator's edge — two reads and no writes.
//
// The panel owned both of these as queries in its own pages, which is the part that mattered: the
// list's search was an OR over name, phone and email written beside a table, and the detail page's
// "مجموع خرید" was an aggregate over orders the page was not showing. Neither could be checked
// against anything, and neither could be given a different meaning without editing a page.
//
// Both reads need an operator. A customer row is a person's name, phone number, address history and
// what they have spent in this shop, and a list of those reachable without a session is not a
// catalogue.

import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service.js";
import { requireAdmin } from "../auth/identity.js";
import { CustomerListQueryDto } from "./dto/customer.dto.js";
import { CustomerNotFoundException } from "./exceptions/customer.exception.js";
import { CustomersService, type CustomerDetail, type CustomerListPage } from "./customers.service.js";

@Controller("customers")
export class CustomersController {
  constructor(
    private readonly auth: AuthService,
    private readonly customers: CustomersService,
  ) {}

  /**
   * The customer list, searched and paged, with the count the header shows.
   *
   * The count comes back with the rows because the header renders it next to them: two reads of the
   * same predicate can disagree, and a header that says ۱۲۸ مشتری above a table of ۲۵ is the shape of
   * that disagreement rather than of a bug anyone would report.
   *
   * The page and size are numbers here rather than the raw strings the query carries, so there is
   * one place that decides what a page of customers is and the panel's own `pageParam` cannot become
   * a second answer to that question.
   */
  @Get()
  async list(@Req() req: Request, @Query() query: CustomerListQueryDto): Promise<CustomerListPage> {
    await requireAdmin(this.auth, req);
    return this.customers.list({ q: query.q, page: query.page, size: query.size });
  }

  /**
   * One customer, with their addresses, their most recent orders and what they have spent.
   *
   * One read rather than three, and the reason is not the round trip: the addresses, the order slice
   * and the order aggregates are three statements that were three queries in a page, and a customer
   * whose order landed between two of them was rendered as a customer with two different order
   * counts. The count and the sum are over every order; the list is the newest 50.
   */
  @Get(":id")
  async one(@Req() req: Request, @Param("id") id: string): Promise<CustomerDetail> {
    await requireAdmin(this.auth, req);
    const detail = await this.customers.detail(id);
    if (!detail) throw new CustomerNotFoundException();
    return detail;
  }
}

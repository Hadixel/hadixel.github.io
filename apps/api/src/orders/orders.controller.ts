// The order read model, as the gateway serves it.
//
// A client renders an order; it does not query one. What crosses the wire is a shape built for
// display — labels resolved, totals already formatted — rather than the row, because the row is the
// gateway's business and the fact that its money is a `Float` in TOMAN is not something a client should
// have to know to add up a basket.
//
// Labels come from `@kmodern/schema` rather than from here, because they are domain vocabulary and the
// panel used to keep its own copy. Resolving them once here is what lets a client render a status
// without knowing the enum.

import { Controller, Get, Param, Post, Query, Req, Body } from "@nestjs/common";
import type { Request } from "express";
import { UnauthorizedException } from "../common/exceptions/gateway.exception.js";
import {
  OrderAdminQueryDto,
  OrderQueryDto,
  StatusChangeDto,
} from "./dto/order-query.dto.js";
import type { OrderDetail, OrderSummary } from "./dto/order.dto.js";
import {
  OrderChangedException,
  OrderNotFoundException,
  TransitionNotAllowedException,
} from "./exceptions/order.exception.js";
import { OrdersService } from "./orders.service.js";

/**
 * The customer a request is acting as, or null when that cannot be established.
 *
 * Ticket 10 builds the session layer that fills this in. Until it does, every customer-scoped route
 * answers 401. That is the safe direction to fail in: a read that treats "I could not tell who this is"
 * as "let them in" hands out order history, and the branch that does it would be the easiest line in
 * this file to add by accident and the hardest to notice in review.
 */
function customerIdFromRequest(_req: Request): string | null {
  return null;
}

export interface OrderListResponse {
  orders: OrderSummary[];
  total: number;
}

@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // ---- shopper: their own orders, and nobody else's ----

  @Get("mine")
  async mine(@Req() req: Request, @Query() query: OrderQueryDto): Promise<OrderListResponse> {
    return this.orders.listOrdersForCustomer(this.requireCustomer(req), {
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get("mine/:id")
  async oneOfMine(@Req() req: Request, @Param("id") id: string): Promise<OrderDetail> {
    const detail = await this.orders.readOrderForCustomer(id, this.requireCustomer(req));
    // Someone else's order answers exactly as an absent one does. Distinguishing them would confirm an
    // order number to whoever guessed it.
    if (!detail) throw new OrderNotFoundException();
    return detail;
  }

  // ---- operator: any order ----

  @Get()
  async list(@Query() query: OrderAdminQueryDto): Promise<OrderListResponse> {
    return this.orders.listOrdersForAdmin({
      limit: query.limit,
      offset: query.offset,
      paymentStatus: query.paymentStatus,
      fulfillmentStatus: query.fulfillmentStatus,
      query: query.q,
    });
  }

  @Get(":id")
  async one(@Param("id") id: string): Promise<OrderDetail> {
    const detail = await this.orders.readOrderForAdmin(id);
    if (!detail) throw new OrderNotFoundException();
    return detail;
  }

  /**
   * What the status form may offer for this order.
   *
   * Served rather than reimplemented in the panel, so the form cannot offer a transition the server
   * would refuse. The form is a rendering of this answer, not a second copy of the rules — which is the
   * whole of what the two byte-identical tables in the panel used to be.
   */
  @Get(":id/transitions")
  async transitions(@Param("id") id: string): Promise<{ fulfillment: string[]; payment: string[] }> {
    const found = await this.orders.transitionsFor(id);
    if (!found) throw new OrderNotFoundException();
    return found;
  }

  @Post(":id/status")
  async setStatus(
    @Param("id") id: string,
    @Body() body: StatusChangeDto,
  ): Promise<{ from: string }> {
    const result = await this.orders.setStatus({
      orderId: id,
      dimension: body.dimension,
      to: body.to,
      // Ticket 12 replaces this with the operator's own identity from the admin session. A fixed actor
      // is honest about that: the audit line says SYSTEM rather than naming an operator who is not
      // identified yet.
      actor: "SYSTEM",
      note: body.note,
    });
    if (result.ok) return { from: result.from };
    if (result.reason === "not-found") throw new OrderNotFoundException();
    if (result.reason === "forbidden") throw new TransitionNotAllowedException("وضعیت فعلی", body.to);
    throw new OrderChangedException();
  }

  private requireCustomer(req: Request): string {
    const customerId = customerIdFromRequest(req);
    if (!customerId) throw new UnauthorizedException();
    return customerId;
  }
}

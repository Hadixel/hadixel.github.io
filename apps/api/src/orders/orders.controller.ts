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

import { Body, Controller, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { ConflictException } from "../common/exceptions/gateway.exception.js";
import { AuthService } from "../auth/auth.service.js";
import { requireAdmin, requireCustomer } from "../auth/identity.js";
import {
  OrderAdminQueryDto,
  OrderQueryDto,
  SettlePaymentBodyDto,
  StatusChangeDto,
} from "./dto/order-query.dto.js";
import type { OrderDetail, OrderSummary, SettlementResponse } from "./dto/order.dto.js";
import {
  OrderChangedException,
  OrderNotFoundException,
  TransitionNotAllowedException,
} from "./exceptions/order.exception.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { OrdersService } from "./orders.service.js";

export interface OrderListResponse {
  orders: OrderSummary[];
  total: number;
}

/** What the manual-order form is filled in from. */
export interface OrderFormOptions {
  customers: { id: string; name: string | null; phone: string }[];
  variants: {
    id: string;
    sku: string;
    price: number;
    stock: number;
    colorName: string;
    product: { name: string };
  }[];
}

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly auth: AuthService,
    // Injected for the one read the form needs rather than reached through the service, because the
    // service is about orders and this is a catalogue read that happens to feed an order form. The
    // alternative is a catalogue method on the orders service, which is where a read does not belong.
    @Inject(DATA_CLIENT) private readonly db: PrismaClient,
  ) {}

  // ---- shopper: their own orders, and nobody else's ----

  @Get("mine")
  async mine(@Req() req: Request, @Query() query: OrderQueryDto): Promise<OrderListResponse> {
    const customer = await requireCustomer(this.auth, req);
    return this.orders.listOrdersForCustomer(customer.id, {
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get("mine/:id")
  async oneOfMine(@Req() req: Request, @Param("id") id: string): Promise<OrderDetail> {
    const customer = await requireCustomer(this.auth, req);
    const detail = await this.orders.readOrderForCustomer(id, customer.id);
    // Someone else's order answers exactly as an absent one does. Distinguishing them would confirm an
    // order number to whoever guessed it.
    if (!detail) throw new OrderNotFoundException();
    return detail;
  }

  // ---- operator: any order ----

  /**
   * What the manual-order form needs to be filled in: the customers to order for and the variants to
   * order.
   *
   * Both together because the form cannot submit without both, and a manual order is the one write in
   * the shop that begins with a human choosing from a list — so the list is the write's own input, and
   * it belongs where the write is validated rather than in a page two queries of its own.
   *
   * Bounded, and the variant row carries its product's name because a SKU alone is not something a
   * person recognises. Capped rather than filtered: an operator with more than five hundred sellable
   * variants needs a search, and this is the list that a search would filter.
   */
  @Get("options")
  async options(@Req() req: Request): Promise<OrderFormOptions> {
    await requireAdmin(this.auth, req);

    const [customers, variants] = await Promise.all([
      this.db.customer.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, phone: true },
        take: 500,
      }),
      this.db.variant.findMany({
        orderBy: { product: { name: "asc" } },
        select: {
          id: true,
          sku: true,
          price: true,
          stock: true,
          colorName: true,
          product: { select: { name: true } },
        },
        take: 500,
      }),
    ]);

    return {
      customers: customers.map((row) => ({ id: row.id, name: row.name, phone: row.phone })),
      // The product stays nested rather than flattened to a name, because that is the shape the form's
      // prop type declares — a read that answers a different shape is a translation the panel has to
      // write, which is the duplication this read exists to remove.
      variants,
    };
  }

  @Get()
  async list(@Req() req: Request, @Query() query: OrderAdminQueryDto): Promise<OrderListResponse> {
    await requireAdmin(this.auth, req);
    return this.orders.listOrdersForAdmin({
      limit: query.limit,
      offset: query.offset,
      paymentStatus: query.paymentStatus,
      fulfillmentStatus: query.fulfillmentStatus,
      query: query.q,
    });
  }

  @Get(":id")
  async one(@Req() req: Request, @Param("id") id: string): Promise<OrderDetail> {
    await requireAdmin(this.auth, req);
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
  async transitions(@Req() req: Request, @Param("id") id: string): Promise<{ fulfillment: string[]; payment: string[] }> {
    await requireAdmin(this.auth, req);
    const found = await this.orders.transitionsFor(id);
    if (!found) throw new OrderNotFoundException();
    return found;
  }

  @Post(":id/status")
  async setStatus(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: StatusChangeDto,
  ): Promise<{ from: string }> {
    // The operator's own identity, so the audit line names the person who made the change rather than
    // a placeholder. An order's history is read by people deciding what to do next.
    const admin = await requireAdmin(this.auth, req);
    const result = await this.orders.setStatus({
      orderId: id,
      dimension: body.dimension,
      to: body.to,
      actor: admin.email,
      note: body.note,
    });
    if (result.ok) return { from: result.from };
    if (result.reason === "not-found") throw new OrderNotFoundException();
    if (result.reason === "forbidden") throw new TransitionNotAllowedException("وضعیت فعلی", body.to);
    throw new OrderChangedException();
  }

  /**
   * Apply a payment outcome to one of the caller's own orders.
   *
   * Reachable only by the storefront, identified by the customer's own session. The call arrives from the
   * payment provider's redirect, so the gateway takes the storefront's report of what the authority
   * said rather than verifying the authority itself. That is the right way round: the signature check
   * belongs to whoever holds the merchant credentials, which is the storefront's process, and the
   * gateway holds the order rules.
   *
   * This route is publishable now and was not before: with no session, anything that could mark an
   * order paid was an unauthenticated route, so it was left off the gateway entirely rather than
   * exposed.
   */
  @Post("mine/:id/payment")
  async settle(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: SettlePaymentBodyDto,
  ): Promise<SettlementResponse> {
    const customer = await requireCustomer(this.auth, req);
    // Scoped to the caller before anything is written: a settlement is about *this* shopper's order, and
    // a guessable id in the path must not reach an order the caller does not own.
    const owned = await this.orders.readOrderForCustomer(id, customer.id);
    if (!owned) throw new OrderNotFoundException();

    const result = await this.orders.settlePayment({
      orderId: id,
      outcome: body.outcome,
      refId: body.refId ?? null,
      actor: "SYSTEM",
    });
    if (result.kind === "not-found") throw new OrderNotFoundException();
    if (result.kind === "hold-lost") {
      // The money arrived for an order whose hold is gone. Refusing loudly is the only safe answer: the
      // alternative is an order marked paid with nobody holding its stock.
      throw new ConflictException("رزرو موجودی این سفارش منقضی شده است؛ با پشتیبانی تماس بگیرید.");
    }
    return result;
  }
}

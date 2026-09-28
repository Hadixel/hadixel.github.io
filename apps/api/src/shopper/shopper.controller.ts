// The shopper's own routes.
//
// Every route here resolves the customer from the request's session before it touches anything, and
// passes that id down as a scope rather than as an identity to be checked afterwards. There is no
// route on this controller that takes a customer id: the one that did would be a route anyone could
// read another shopper's orders through, and the fact that its name is `customerId` is exactly why.
//
// The origin check is not here. It is `OriginGuard`, registered in the composition root over every
// mutating method — see `common/guards/origin.guard.ts` — so a route added next year is covered by
// being a write. Re-implementing it per controller is the thing that guard exists to have ended.

import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service.js";
import { requireCustomer } from "../auth/identity.js";
import { OrderNotFoundException } from "../orders/exceptions/order.exception.js";
import type { OrderDetail } from "../orders/dto/order.dto.js";
import { PaymentAuthorityDto } from "./dto/payment-window.dto.js";
import {
  ShopperService,
  type PaymentWindow,
  type PaymentWindowStatus,
} from "./shopper.service.js";

@Controller("shopper")
export class ShopperController {
  constructor(
    private readonly shopper: ShopperService,
    private readonly auth: AuthService,
  ) {}

  /**
   * One of the caller's orders, by the order number their link carries.
   *
   * Declared before the window routes so a literal path segment here cannot be read as an id: the
   * `:id` below matches any segment, and route order is the only thing that keeps `by-number` from
   * being an order id in one position and a keyword in the other.
   */
  @Get("orders/by-number/:orderNumber")
  async orderByNumber(
    @Req() req: Request,
    @Param("orderNumber") orderNumber: string,
  ): Promise<OrderDetail> {
    const customer = await requireCustomer(this.auth, req);
    const order = await this.shopper.readOrderByNumber(orderNumber, customer.id);
    // Someone else's order answers exactly as an absent one does. Answering 403 would confirm an
    // order number to whoever guessed it, and these are guessable: they are printed on a page and
    // quoted over the phone.
    if (!order) throw new OrderNotFoundException();
    return order;
  }

  /**
   * Open the window a shopper pays within, and answer what the provider is to be asked for.
   *
   * A write, and a small one: it records when the payment window closes, from the same setting the
   * stock hold behind the order was taken under.
   */
  @Post("orders/:id/payment-window")
  async openPaymentWindow(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<PaymentWindow> {
    const customer = await requireCustomer(this.auth, req);
    const window = await this.shopper.openPaymentWindow(id, customer.id);
    if (!window) throw new OrderNotFoundException();
    return window;
  }

  /**
   * Record the provider's reference for the window that was just opened.
   *
   * Its own route because the reference does not exist until the merchant has been called, and the
   * amount has to be known before that call — so the window is opened, the provider answers, and the
   * answer is recorded here.
   */
  @Post("orders/:id/payment-window/authority")
  async recordAuthority(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: PaymentAuthorityDto,
  ): Promise<{ id: string; authority: string }> {
    const customer = await requireCustomer(this.auth, req);
    const recorded = await this.shopper.recordPaymentAuthority(id, customer.id, body.authority);
    if (!recorded) throw new OrderNotFoundException();
    return { id, authority: body.authority };
  }

  /** The window as it stands, for a page waiting on the provider to send the shopper back. */
  @Get("orders/:id/payment-window")
  async readPaymentWindow(
    @Req() req: Request,
    @Param("id") id: string,
  ): Promise<PaymentWindowStatus> {
    const customer = await requireCustomer(this.auth, req);
    const window = await this.shopper.readPaymentWindow(id, customer.id);
    if (!window) throw new OrderNotFoundException();
    return window;
  }
}

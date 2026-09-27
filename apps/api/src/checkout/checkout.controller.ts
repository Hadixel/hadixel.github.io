// The checkout and cart routes.
//
// Three things a shopper does that need a rule decided somewhere they cannot edit: look at a basket,
// ask what it would cost to deliver, and place the order. All three are here, so the storefront's
// route handlers become callers.
//
// The customer is resolved from the request's own credentials, as in the orders feature. Until ticket
// 10 builds sessions this answers 401, which is the safe direction: a checkout that placed an order for
// "whoever called" is an order nobody can be held to.

import { Body, Controller, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { UnauthorizedException } from "../common/exceptions/gateway.exception.js";
import { CheckoutService } from "./checkout.service.js";
import {
  EnrichRequestDto,
  PlaceOrderRequestDto,
  QuoteRequestDto,
  type CheckoutQuote,
  type EnrichedCart,
  type PlacedOrder,
} from "./dto/checkout.dto.js";

function customerIdFromRequest(_req: Request): string | null {
  return null;
}

@Controller("checkout")
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  /**
   * What the basket would cost to deliver.
   *
   * Same rules as placing, run in the same order — a quote that disagrees with the order it precedes is
   * worse than no quote, because the shopper has been shown a number they will not be charged.
   */
  @Post("quote")
  async quote(
    @Body() body: QuoteRequestDto,
    @Req() req: Request,
  ): Promise<CheckoutQuote> {
    return this.checkout.quote({
      address: body.address,
      items: body.items,
      customerId: customerIdFromRequest(req) ?? undefined,
      couponCode: body.couponCode,
    });
  }

  @Post()
  async place(
    @Body() body: PlaceOrderRequestDto,
    @Req() req: Request,
  ): Promise<PlacedOrder> {
    const customerId = customerIdFromRequest(req);
    if (!customerId) throw new UnauthorizedException();
    return this.checkout.placeOrder({
      customerId,
      address: body.address,
      items: body.items,
      paymentMethod: body.paymentMethod,
      couponCode: body.couponCode,
    });
  }
}

@Controller("cart")
export class CartController {
  constructor(private readonly checkout: CheckoutService) {}

  /**
   * Resolve a stored basket against live data.
   *
   * Unauthenticated on purpose: a basket is a device's own list, held in the browser's cookie, and
   * resolving it reveals nothing about anybody's account.
   */
  @Post("enrich")
  async enrich(@Body() body: EnrichRequestDto): Promise<EnrichedCart> {
    return this.checkout.enrichCart(body.items);
  }
}

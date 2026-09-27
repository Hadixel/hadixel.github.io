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
import { AuthService } from "../auth/auth.service.js";
import { requireCustomer } from "../auth/identity.js";
import { CheckoutService } from "./checkout.service.js";
import {
  EnrichRequestDto,
  PlaceOrderRequestDto,
  QuoteRequestDto,
  type CheckoutQuote,
  type EnrichedCart,
  type PlacedOrder,
} from "./dto/checkout.dto.js";

@Controller("checkout")
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly auth: AuthService,
  ) {}

  /**
   * What the basket would cost to deliver.
   *
   * Same rules as placing, run in the same order — a quote that disagrees with the order it precedes is
   * worse than no quote, because the shopper has been shown a number they will not be charged.
   *
   * A signed-in shopper's quote may use their discounts, so identity is optional here rather than
   * required. An anonymous quote is still the same computation, just without a customer to scope
   * per-customer limits by.
   */
  @Post("quote")
  async quote(@Body() body: QuoteRequestDto, @Req() req: Request): Promise<CheckoutQuote> {
    const customer = await this.optionalCustomer(req);
    return this.checkout.quote({
      address: body.address,
      items: body.items,
      customerId: customer?.id,
      couponCode: body.couponCode,
    });
  }

  @Post()
  async place(@Body() body: PlaceOrderRequestDto, @Req() req: Request): Promise<PlacedOrder> {
    const customer = await requireCustomer(this.auth, req);
    return this.checkout.placeOrder({
      customerId: customer.id,
      address: body.address,
      items: body.items,
      paymentMethod: body.paymentMethod,
      couponCode: body.couponCode,
    });
  }

  /**
   * A customer, or null.
   *
   * Distinct from `requireCustomer` on purpose: this route has two legitimate callers, one of whom has
   * no session. A helper that threw, or one that swallowed the failure, would make one of them wrong.
   */
  private async optionalCustomer(req: Request): Promise<{ id: string } | null> {
    try {
      return await requireCustomer(this.auth, req);
    } catch {
      return null;
    }
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

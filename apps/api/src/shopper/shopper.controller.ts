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
import {
  PaymentAuthorityDto,
  StartPaymentDto,
  VerifyPaymentDto,
} from "./dto/payment-window.dto.js";
import { requestPayment, verifyPayment, zarinpalConfigFromEnv } from "../payments/zarinpal.js";
import { PaymentProviderMissingException } from "../orders/exceptions/order.exception.js";
import { tomanToRial } from "@kmodern/schema";
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
   * Open the window, call the provider, and record what it said — in one call.
   *
   * This is the write the storefront used to make in three, across two processes, holding the
   * merchant's provider credentials in the second one. The amount the provider is asked to charge is
   * resolved here from the order and the window is recorded here, so the figure cannot drift from the
   * window it opens, and the credentials that authorise the charge exist in exactly one process.
   *
   * `callbackUrl` is the one thing the caller must supply, and it is a fact about the client rather
   * than about the order: where the provider sends the shopper back is the storefront's business, and
   * the gateway is not the one rendering the page they land on.
   */
  @Post("orders/:id/payment-start")
  async startPayment(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: StartPaymentDto,
  ): Promise<{ authority: string; startPayUrl: string }> {
    const customer = await requireCustomer(this.auth, req);

    const window = await this.shopper.openPaymentWindow(id, customer.id);
    if (!window) throw new OrderNotFoundException();

    const config = zarinpalConfigFromEnv();
    if (!config) throw new PaymentProviderMissingException();

    const requested = await requestPayment(config, {
      amountRial: window.amountRial,
      description: `سفارش ${window.orderNumber}`,
      callbackUrl: body.callbackUrl,
      orderId: window.orderNumber,
    });

    // The window is open and the shopper can pay; failing to store the reference costs the order its
    // handle for the operator and nothing else, so a failure here is reported rather than allowed to
    // abandon a payment the shopper can still make.
    await this.shopper.recordPaymentAuthority(id, customer.id, requested.authority);

    return { authority: requested.authority, startPayUrl: requested.startPayUrl };
  }

  /**
   * Verify what the provider says and settle the order, in one call.
   *
   * The verification and the settlement are together because separating them is how a payment ends up
   * verified against one amount and settled against another: the caller has to fetch the total, convert
   * it, and pass it back, and every one of those steps is a place for the two numbers to disagree. Here
   * the gateway holds the order, the order's total and the credentials in the same place, so the amount
   * verified is the amount the order says.
   *
   * A duplicate callback is an ordinary answer, not a fault: the settlement is applied once and the
   * second caller is told so.
   */
  @Post("orders/:id/payment-verify")
  async verifyPayment(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: VerifyPaymentDto,
  ): Promise<{ outcome: "PAID" | "FAILED"; settlement: string; refId?: string }> {
    const customer = await requireCustomer(this.auth, req);

    const order = await this.shopper.readOrderForPayment(id, customer.id);
    if (!order) throw new OrderNotFoundException();

    const config = zarinpalConfigFromEnv();
    if (!config) throw new PaymentProviderMissingException();

    const verification = await verifyPayment(
      config,
      body.authority,
      tomanToRial(order.total),
    );

    // 100 is a fresh success; 101 means the provider already saw this authority, which for a duplicate
    // redirect is the expected answer rather than a problem — the settlement below is a compare-and-set,
    // so applying it twice is refused rather than doubled.
    const verified = verification.code === 100 || verification.code === 101;
    const refId = verification.refId;

    if (!verified) {
      const settlement = await this.shopper.settlePayment({
        orderId: id,
        outcome: "FAILED",
        actor: "SYSTEM",
      });
      return { outcome: "FAILED", settlement: settlement.kind };
    }

    const settlement = await this.shopper.settlePayment({
      orderId: id,
      outcome: "PAID",
      refId,
      actor: "SYSTEM",
    });
    return { outcome: "PAID", settlement: settlement.kind, refId };
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

// The shopper's own reads and the payment window they open, in one place.
//
// Everything here is scoped to the customer the controller resolved from the request's session, and
// the scope is part of the query rather than a check applied to a row that was fetched first. That
// is not a style preference: a storefront read that returns another customer's order is the worst bug
// this feature can have, and "fetch then decide" is how one is written by accident — the filter goes
// in the wrong clause, or a later refactor drops it, and the row is already in memory.
//
// The order read model itself is not rebuilt here. `OrdersService` owns what an order is, in the
// shape both apps render, and this service composes it. A second projection of the same row is the
// duplication the gateway exists to end, and it would be reintroduced by whoever wrote it second.

import { Inject, Injectable } from "@nestjs/common";
import { paymentLabel, tomanToRial } from "@kmodern/schema";
import { PaymentMethod, PaymentStatus } from "../generated/prisma/enums.js";
import { holdExpiry } from "../inventory/inventory.service.js";
import {
  OrdersService,
  type SettlePaymentInput,
  type SettlementResult,
} from "../orders/orders.service.js";
import type { OrderDetail } from "../orders/dto/order.dto.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { PrismaClient } from "../generated/prisma/client.js";

/**
 * A payment window, opened.
 *
 * The amount crosses in Rial because the unit belongs to the payment provider, not to the shop: it
 * is what the merchant will be asked to charge, and the storefront used to work it out from the
 * order row with the shared conversion. Returning it means the number the shopper is charged and the
 * number the callback verifies come from one place, and the conversion cannot be applied to one and
 * not the other.
 */
export interface PaymentWindow {
  id: string;
  orderNumber: string;
  amountRial: number;
  /** When the window closes, as the hold behind the order closes. */
  expiresAt: string;
}

/** What a shopper's polling read of the window can see. */
export interface PaymentWindowStatus {
  paymentStatus: string;
  paymentLabel: string;
  /** The provider's reference for the window, once the provider has answered. */
  authority: string | null;
  expiresAt: string | null;
}

@Injectable()
export class ShopperService {
  constructor(
    private readonly orders: OrdersService,
    @Inject(DATA_CLIENT) private readonly db: PrismaClient,
  ) {}

  /** One of this customer's orders, addressed the way their own link addresses it. */
  async readOrderByNumber(
    orderNumber: string,
    customerId: string,
  ): Promise<OrderDetail | null> {
    return this.orders.readOrderByNumberForCustomer(orderNumber, customerId);
  }

  /**
   * Open a payment window on one of the caller's own orders, and answer what to charge.
   *
   * Three conditions, all in the one query, and all of them about the same thing: the order has to be
   * this shopper's, still awaiting payment, and paid for online. A cash-on-delivery or card-to-card
   * order has no window to open, and an order that is already paid has nothing to charge for — both
   * answer as absent rather than as refused, because "you may not pay this" would tell a shopper
   * probing for another's order that it exists and what state it is in.
   *
   * The window's length is the stock hold's length, resolved by the inventory module from the
   * merchant's setting. It used to be read from the same setting by the storefront's own payment
   * route, which is a second reader of one setting and a second place for the two to drift.
   */
  async openPaymentWindow(
    orderId: string,
    customerId: string,
  ): Promise<PaymentWindow | null> {
    const order = await this.db.order.findFirst({
      where: {
        id: orderId,
        customerId,
        paymentStatus: PaymentStatus.AWAITING,
        paymentMethod: PaymentMethod.ONLINE,
      },
      select: { id: true, orderNumber: true, total: true },
    });
    if (!order) return null;

    const expiresAt = await holdExpiry(PaymentMethod.ONLINE, this.db);
    await this.db.order.update({
      where: { id: order.id },
      data: { paymentExpiresAt: expiresAt },
    });

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      amountRial: tomanToRial(order.total),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Record the payment provider's reference for the window that was opened.
   *
   * Separate from opening because the reference does not exist until after the merchant has been
   * called, and the amount has to be known before that call. Scoped like every other write here, so
   * a guessed id cannot have an authority written against someone else's order — which would leave
   * the provider's record and the order's disagreeing with nothing to say which is right.
   */
  async recordPaymentAuthority(
    orderId: string,
    customerId: string,
    authority: string,
  ): Promise<boolean> {
    const claimed = await this.db.order.updateMany({
      where: { id: orderId, customerId },
      data: { gatewayAuthority: authority },
    });
    return claimed.count === 1;
  }

  /** The window as it stands, for a page that is waiting on the provider to send the shopper back. */
  async readPaymentWindow(
    orderId: string,
    customerId: string,
  ): Promise<PaymentWindowStatus | null> {
    const order = await this.db.order.findFirst({
      where: { id: orderId, customerId },
      select: {
        paymentStatus: true,
        gatewayAuthority: true,
        paymentExpiresAt: true,
      },
    });
    if (!order) return null;
    return {
      paymentStatus: order.paymentStatus,
      paymentLabel: paymentLabel(order.paymentStatus),
      authority: order.gatewayAuthority,
      expiresAt: order.paymentExpiresAt ? order.paymentExpiresAt.toISOString() : null,
    };
  }

  /**
   * The total to verify a payment against, for one of the caller's own orders.
   *
   * Scoped to the shopper, so a callback naming someone else's order is absent rather than answered
   * with its total. The verification happens in this process precisely so the amount is read once, next
   * to the settlement it authorises — a caller that fetched the total and passed it back would be
   * holding two numbers, and nothing would stop them differing.
   */
  async readOrderForPayment(
    orderId: string,
    customerId: string,
  ): Promise<{ id: string; orderNumber: string; total: number } | null> {
    return this.db.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true, orderNumber: true, total: true },
    });
  }

  /**
   * Settle one of the caller's own orders, taking the compare-and-set and the stock commit with it.
   *
   * Exposed so the controller does not reach through this service into `OrdersService`, which would
   * make the settlement reachable without the shopper check that scopes it.
   */
  async settlePayment(input: SettlePaymentInput): Promise<SettlementResult> {
    return this.orders.settlePayment(input);
  }
}

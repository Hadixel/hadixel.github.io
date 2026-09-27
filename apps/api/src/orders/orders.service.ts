// Orders and payment: the rules, applied once.
//
// What lives here used to be spread across the storefront's callback route and the panel's status
// action, and the two disagreed about when stock moves. A payment callback in particular did three
// separate writes — commit the stock, write the status, record the event — with nothing holding them
// together, so a duplicate callback could interleave a commit with a release, and the cancellation
// path released stock unconditionally, which meant a callback arriving after a successful one could
// take a paid order's units back off the shelf.
//
// The rule this module exists to enforce: stock moves only when a call has won the right to move it,
// and it moves inside the same transaction as the status change that justified it. So a settlement is
// taken with a compare-and-set on the status, the side effect runs only if that claim succeeded, and a
// caller that loses the race is told what happened instead of being allowed to repeat the work.

import { Inject, Injectable } from "@nestjs/common";
import { formatToman, tomanToRial, fulfillmentLabel, paymentLabel } from "@kmodern/schema";
import { PaymentStatus } from "../generated/prisma/enums.js";
import { commitStock, releaseStock, restock } from "../inventory/inventory.service.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { createPrismaClient } from "../prisma/client.js";
import {
  allowedTransitions,
  isAllowedTransition,
  stockEffectFor,
  type TransitionDimension,
} from "./order-transitions.js";
import type { OrderDetail, OrderSummary } from "./dto/order.dto.js";

type Db = ReturnType<typeof createPrismaClient>;

/** The order row fields both read models are built from. Named so a projection change is one edit. */
type OrderBase = {
  id: string;
  orderNumber: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  total: number;
  placedAt: Date;
  shippingAddress: unknown;
};

type OrderItemRow = {
  productName: string;
  colorName: string | null;
  sku: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  image: string | null;
};

type OrderEventRow = {
  dimension: string;
  from: string;
  to: string;
  actor: string;
  note: string | null;
  at: Date;
};

/** How a settlement ended. Each is a decision the caller has to act on differently. */
export type SettlementResult =
  /** This call applied the settlement. */
  | { kind: "settled"; paymentStatus: PaymentStatus }
  /** The order was already in this state. A duplicate callback: correct to ignore, not an error. */
  | { kind: "already"; paymentStatus: PaymentStatus }
  /** The order is in some other state, so this settlement must not be applied. */
  | { kind: "conflict"; paymentStatus: PaymentStatus }
  /** The hold this payment would commit is gone, so the payment cannot be recorded. */
  | { kind: "hold-lost" }
  | { kind: "not-found" };

export type SettlePaymentInput = {
  orderId: string;
  outcome: "PAID" | "FAILED";
  /** The payment gateway's own reference, recorded so a later refund can find the payment. */
  refId?: string | null;
  actor: string;
  note?: string;
};

@Injectable()
export class OrdersService {
  constructor(@Inject(DATA_CLIENT) private readonly db: Db) {}

  /**
   * Apply a payment outcome to an order, at most once.
   *
   * The whole thing is one transaction. The order's payment status is claimed with a conditional
   * update — `where` naming the state it had to be in — and the stock side effect runs only once that
   * claim has succeeded. A callback that arrives second, concurrently or after the fact, updates
   * nothing, finds the status already where it was being asked to put it, and is told the settlement
   * is already applied. That is the whole answer to "can a duplicate callback double-apply": no,
   * because the second one never reaches the code that moves stock.
   *
   * Losing the claim is also what protects a paid order from a late cancellation: the failure path has
   * no unconditional release left to run, so it cannot take a settled order's stock back.
   */
  async settlePayment(input: SettlePaymentInput): Promise<SettlementResult> {
    const target = input.outcome === "PAID" ? PaymentStatus.PAID : PaymentStatus.FAILED;

    try {
      return await this.db.$transaction(async (tx) => {
        // The claim. Naming the expected state in the `where` is what makes this a compare-and-set
        // rather than a read followed by a write: two callers racing here are serialised by the row
        // lock, and the loser updates zero rows.
        const claimed = await tx.order.updateMany({
          where: { id: input.orderId, paymentStatus: PaymentStatus.AWAITING },
          data: {
            paymentStatus: target,
            ...(input.outcome === "PAID" && input.refId ? { gatewayRefId: input.refId } : {}),
          },
        });

        if (claimed.count !== 1) {
          // Nothing was written. Re-read to say why, so the caller can tell "you already did this"
          // from "this order is somewhere else entirely" — the two need opposite handling.
          const current = await tx.order.findUnique({
            where: { id: input.orderId },
            select: { paymentStatus: true },
          });
          if (!current) return { kind: "not-found" } as const;
          return current.paymentStatus === target
            ? ({ kind: "already", paymentStatus: current.paymentStatus } as const)
            : ({ kind: "conflict", paymentStatus: current.paymentStatus } as const);
        }

        // The hold is only committed once the status change it belongs to has been claimed. If the
        // hold is gone this throws, and the throw rolls the status change back with it: an order
        // marked paid whose stock nobody holds is oversold, and restock will not bring it back.
        if (input.outcome === "PAID") await commitStock(input.orderId, tx);
        else await releaseStock(input.orderId, tx);

        await tx.orderStatusEvent.create({
          data: {
            orderId: input.orderId,
            dimension: "PAYMENT",
            from: PaymentStatus.AWAITING,
            to: target,
            actor: input.actor,
            note: input.note,
          },
        });

        return { kind: "settled", paymentStatus: target } as const;
      });
    } catch (error) {
      // The hold was claimed and then could not be committed. The transaction has already rolled the
      // status write back, so this is reported rather than swallowed: the caller must not tell a
      // shopper their payment succeeded.
      if (error instanceof Error && error.message.startsWith("STOCK_HOLD_LOST")) {
        return { kind: "hold-lost" };
      }
      throw error;
    }
  }

  /**
   * Move an order's fulfilment or payment status, with the stock side effect that transition implies.
   *
   * The same claim-then-act shape as a settlement, for the same reason: the panel's form is driven by
   * `allowedTransitions`, but the server does not trust the form, and a double-submitted status
   * change must not move stock twice.
   */
  async setStatus(input: {
    orderId: string;
    dimension: TransitionDimension;
    to: string;
    actor: string;
    note?: string;
  }): Promise<{ ok: true; from: string } | { ok: false; reason: "not-found" | "forbidden" | "conflict" }> {
    return this.db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: input.orderId } });
      if (!order) return { ok: false as const, reason: "not-found" as const };

      const from = input.dimension === "FULFILLMENT" ? order.fulfillmentStatus : order.paymentStatus;
      // The server does not take the form's word for what is allowed; it asks the same table the form
      // was rendered from.
      if (!isAllowedTransition(input.dimension, from, input.to)) {
        return { ok: false as const, reason: "forbidden" as const };
      }

      const statusField = input.dimension === "FULFILLMENT" ? "fulfillmentStatus" : "paymentStatus";
      const claimed = await tx.order.updateMany({
        where: { id: input.orderId, [statusField]: from } as never,
        data: { [statusField]: input.to } as never,
      });
      if (claimed.count !== 1) return { ok: false as const, reason: "conflict" as const };

      const effect = stockEffectFor(input.dimension, input.to, order.paymentStatus);
      if (effect === "commit") await commitStock(input.orderId, tx);
      else if (effect === "release") await releaseStock(input.orderId, tx);
      else if (effect === "restock") await restock(input.orderId, tx);

      await tx.orderStatusEvent.create({
        data: {
          orderId: input.orderId,
          dimension: input.dimension,
          from,
          to: input.to,
          actor: input.actor,
          note: input.note,
        },
      });

      return { ok: true as const, from };
    });
  }

  /**
   * What the panel's status form may offer for an order in this state.
   *
   * Served rather than reimplemented in the client, so the two cannot drift: the form is rendered from
   * the same table the server enforces. An order that is not there has nothing to transition.
   */
  async transitionsFor(
    orderId: string,
  ): Promise<{ fulfillment: string[]; payment: string[] } | null> {
    const order = await this.db.order.findUnique({
      where: { id: orderId },
      select: { fulfillmentStatus: true, paymentStatus: true },
    });
    if (!order) return null;
    return {
      fulfillment: [...allowedTransitions("FULFILLMENT", order.fulfillmentStatus)],
      payment: [...allowedTransitions("PAYMENT", order.paymentStatus)],
    };
  }

  /**
   * One order for a shopper, who may only see their own.
   *
   * The customer is part of the query rather than checked afterwards, so there is no path where an
   * order is fetched and then a decision is made about whether to return it. A shopper who guesses an
   * order number gets the same answer as one who guesses a wrong id.
   */
  async readOrderForCustomer(
    orderId: string,
    customerId: string,
  ): Promise<OrderDetail | null> {
    const order = await this.db.order.findFirst({
      where: { id: orderId, customerId },
      include: { items: true, events: { orderBy: { at: "asc" } } },
    });
    if (!order) return null;
    return this.toDetail(order);
  }

  /** One order for the panel, which is allowed to see any of them. */
  async readOrderForAdmin(orderId: string): Promise<OrderDetail | null> {
    const order = await this.db.order.findUnique({
      where: { id: orderId },
      include: { items: true, events: { orderBy: { at: "asc" } } },
    });
    if (!order) return null;
    return this.toDetail(order);
  }

  /**
   * A shopper's orders, newest first.
   *
   * Paged rather than unbounded: a customer with a long history is a real customer, and returning
   * every order they have ever placed is how an account page starts timing out.
   */
  async listOrdersForCustomer(
    customerId: string,
    opts: { limit: number; offset: number },
  ): Promise<{ orders: OrderSummary[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.db.order.findMany({
        where: { customerId },
        orderBy: { placedAt: "desc" },
        take: opts.limit,
        skip: opts.offset,
        include: { items: { select: { quantity: true } } },
      }),
      this.db.order.count({ where: { customerId } }),
    ]);
    return { orders: rows.map((row) => this.toSummary(row)), total };
  }

  /** The panel's order list, filterable by the two statuses an operator actually filters on. */
  async listOrdersForAdmin(opts: {
    limit: number;
    offset: number;
    paymentStatus?: string;
    fulfillmentStatus?: string;
    query?: string;
  }): Promise<{ orders: OrderSummary[]; total: number }> {
    const where = {
      ...(opts.paymentStatus ? { paymentStatus: opts.paymentStatus as never } : {}),
      ...(opts.fulfillmentStatus ? { fulfillmentStatus: opts.fulfillmentStatus as never } : {}),
      ...(opts.query
        ? {
            OR: [
              { orderNumber: { contains: opts.query } },
              { customer: { phone: { contains: opts.query } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.order.findMany({
        where,
        orderBy: { placedAt: "desc" },
        take: opts.limit,
        skip: opts.offset,
        include: { items: { select: { quantity: true } } },
      }),
      this.db.order.count({ where }),
    ]);
    return { orders: rows.map((row) => this.toSummary(row)), total };
  }

  /**
   * A payment request's amount, in the unit the payment gateway wants.
   *
   * The conversion is the shared one rather than a multiplication written at the call site, because the
   * two sites that used to do this by hand are how a boundary ends up with the factor right on the way
   * out and wrong on the way back: the request verifies against a number the customer was never
   * charged.
   */
  async paymentAmountFor(orderId: string): Promise<{ amountRial: number; orderNumber: string } | null> {
    const order = await this.db.order.findUnique({
      where: { id: orderId },
      select: { total: true, orderNumber: true, paymentStatus: true, paymentMethod: true },
    });
    if (!order) return null;
    return { amountRial: tomanToRial(order.total), orderNumber: order.orderNumber };
  }

  private toSummary(row: OrderBase & { items?: { quantity: number }[] }): OrderSummary {
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      fulfillmentLabel: fulfillmentLabel(row.fulfillmentStatus),
      paymentLabel: paymentLabel(row.paymentStatus),
      fulfillmentStatus: row.fulfillmentStatus,
      paymentStatus: row.paymentStatus,
      total: row.total,
      totalFormatted: formatToman(row.total),
      placedAt: row.placedAt.toISOString(),
      itemCount: (row.items ?? []).reduce((sum, item) => sum + item.quantity, 0),
    };
  }

  private toDetail(
    row: OrderBase & { items: OrderItemRow[]; events: OrderEventRow[] },
  ): OrderDetail {
    return {
      ...this.toSummary(row),
      items: row.items.map((item) => ({
        productName: item.productName,
        colorName: item.colorName,
        sku: item.sku,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
        lineTotalFormatted: formatToman(item.lineTotal),
        image: item.image,
      })),
      events: row.events.map((event) => ({
        dimension: event.dimension,
        from: event.from,
        to: event.to,
        actor: event.actor,
        note: event.note,
        at: event.at.toISOString(),
      })),
      transitions: {
        fulfillment: [...allowedTransitions("FULFILLMENT", row.fulfillmentStatus)],
        payment: [...allowedTransitions("PAYMENT", row.paymentStatus)],
      },
      shippingAddress: row.shippingAddress,
    };
  }
}

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
import {
  formatToman,
  fulfillmentLabel,
  orderEventLabel,
  paymentLabel,
  paymentMethodLabel,
  tomanToRial,
} from "@kmodern/contracts";
import { Inject, Injectable } from "@nestjs/common";
import {
  DeliveryFeeMode,
  PaymentStatus,
  type PaymentMethod,
  type ShippingMethod,
  type createPrismaClient,
} from "../prisma/index.js";
import { commitStock, releaseStock, reserveStock, restock } from "../inventory/inventory.service.js";
import { nextOrderNumber } from "../checkout/order-number.js";
import { OrderRuleViolation } from "./exceptions/order.exception.js";
import { writeAudit } from "../common/audit.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import {
  allowedTransitions,
  isAllowedTransition,
  stockEffectFor,
  type TransitionDimension,
} from "./order-transitions.js";

import type {
  OrderAdminDetail,
  OrderAdminSummary,
  OrderDetail,
  OrderShippingAddress,
  OrderSummary,
} from "./dto/order.dto.js";

type Db = ReturnType<typeof createPrismaClient>;

/** One line of an operator-placed order. */
export interface ManualOrderLine {
  variantId: string;
  qty: number;
}

export interface ManualOrderInput {
  customerId: string;
  address: unknown;
  paymentMethod: PaymentMethod;
  shippingMethod: ShippingMethod;
  deliveryFeeMode: DeliveryFeeMode;
  deliveryFee: number;
  adminNote: string | null;
  lines: ManualOrderLine[];
  /** Who is doing it, written onto the status events so the trail names a person and not a session. */
  actor: string;
  /**
   * The hold's lifetime, resolved by the caller.
   *
   * Named rather than left to `reserveStock` because the window is a shop setting and the panel reads
   * it; letting the inventory module read it too would be two readers of one setting, which is the
   * shape of problem `GET /settings/values` exists to end.
   */
  reserveWindow?: { expiresAt?: Date };
  meta?: { adminUserId?: string | null; ip?: string | null; userAgent?: string | null };
}


/**
 * The order row fields every read model is built from. Named so a projection change is one edit.
 *
 * The money is here rather than in the operator's row because a shopper's order page prints how its
 * total was reached too: the storefront read those three columns itself and formatted them, which is
 * the same translation in a second place.
 */
type OrderBase = {
  id: string;
  orderNumber: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
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

/** The fields the operator's detail adds to the row: who ordered it, how it ships, and what is behind it. */
type OrderAdminRow = OrderBase & {
  customerId: string;
  customer: { id: string; name: string | null; phone: string; email: string | null };
  shippingMethod: string;
  deliveryFeeMode: string;
  gatewayRefId: string | null;
  shippingTracking: string | null;
  adminNote: string | null;
  items: OrderItemRow[];
  events: OrderEventRow[];
  reservations: { id: string; qty: number; status: string; expiresAt: Date }[];
};

/**
 * What one order's read model is built from: its lines, and its history in the order a reader reads.
 *
 * Named because the two shopper reads — by id and by order number — must project the same thing. A
 * detail assembled from one query here and a second query there is a detail whose two callers
 * disagree about what an order is.
 */
const ORDER_DETAIL_INCLUDE = { items: true, events: { orderBy: { at: "asc" } } } as const;

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

      // Inside this transaction, not after it. The panel wrote this line once the change had already
      // committed, so a failed audit write left an order nobody could account for and the operator was
      // told it had worked. Written here, the line and the change succeed or fail together.
      await writeAudit(tx, {
        action: `ORDER_${input.to}`,
        entityType: "ORDER",
        entityId: input.orderId,
        meta: {
          dimension: input.dimension,
          from,
          to: input.to,
          note: input.note ?? null,
          orderNumber: order.orderNumber,
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
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!order) return null;
    return this.toDetail(order);
  }

  /**
   * The same read, keyed the way a shopper's own link is.
   *
   * `/order/1404-000123` is the address of an order; its id is not in it, and a page that resolved
   * the number to an id in the client would be doing a lookup whose only outcome is a second read
   * with the same authorisation question. So the number is looked up here, scoped to the customer in
   * the query for the reason the one above gives: someone's order number is guessable, and a refusal
   * that named the order would confirm it exists.
   */
  async readOrderByNumberForCustomer(
    orderNumber: string,
    customerId: string,
  ): Promise<OrderDetail | null> {
    const order = await this.db.order.findFirst({
      where: { orderNumber, customerId },
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!order) return null;
    return this.toDetail(order);
  }

  /**
   * One order for the panel, which is allowed to see any of them.
   *
   * Everything one order page prints, in one query: the customer beside the order, the stock holds
   * behind it, and the events in the order the history reads best. The panel used to assemble this
   * itself — one `findUnique` with four `include`s and a cast on the address — and the address cast
   * is the part worth naming: it asserted a `Json` snapshot was a `Record<string, string>` and then
   * read five keys off it, which is a claim about the column that no client can check.
   */
  async readOrderForAdmin(orderId: string): Promise<OrderAdminDetail | null> {
    const order = await this.db.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        events: { orderBy: { at: "asc" } },
        reservations: { orderBy: { expiresAt: "asc" } },
        customer: { select: { id: true, name: true, phone: true, email: true } },
      },
    });
    if (!order) return null;
    return this.toAdminDetail(order);
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

  /**
   * The panel's order list, filterable by the two statuses an operator actually filters on and by a
   * term typed into one box.
   *
   * Each row carries the customer and the payment method, because those are two of the seven columns
   * the table prints and a list that omits them is a list the page has to go and fetch the rest of.
   */
  async listOrdersForAdmin(opts: {
    limit: number;
    offset: number;
    paymentStatus?: string;
    fulfillmentStatus?: string;
    query?: string;
  }): Promise<{ orders: OrderAdminSummary[]; total: number }> {
    const where = {
      ...(opts.paymentStatus ? { paymentStatus: opts.paymentStatus as never } : {}),
      ...(opts.fulfillmentStatus ? { fulfillmentStatus: opts.fulfillmentStatus as never } : {}),
      // The order number *or* the phone, matched without regard to case — the panel's search box
      // always did both and always did it case-insensitively, and a search that quietly stopped
      // matching a customer's number reads as a shop with fewer orders in it.
      ...(opts.query
        ? {
            OR: [
              { orderNumber: { contains: opts.query, mode: "insensitive" as const } },
              { customer: { phone: { contains: opts.query, mode: "insensitive" as const } } },
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
        include: {
          items: { select: { quantity: true } },
          customer: { select: { id: true, name: true, phone: true } },
        },
      }),
      this.db.order.count({ where }),
    ]);
    return {
      orders: rows.map((row) => ({
        ...this.toSummary(row),
        paymentMethod: row.paymentMethod,
        customer: row.customer,
      })),
      total,
    };
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

  /**
   * Create an order on an operator's behalf — a telephone order, a shopfront sale.
   *
   * This was a transaction written in the panel: it allocated the order number, priced the lines,
   * reserved the stock, wrote the status events and the audit line, and committed. Every part of that
   * is a rule the gateway already holds — `nextOrderNumber` is the same counter the checkout allocates
   * from, and `reserveStock` is the same hold — so leaving the write in the panel meant two paths to an
   * order were two implementations free to disagree about what an order is.
   *
   * The differences from a checkout are deliberate and small. A manual order may be cash on delivery,
   * in which case it is born paid and its stock is committed rather than held, because the money
   * genuinely changed hands at the counter. It is not subject to the one-unpaid-order rule, which
   * exists to stop a shopper's browser retrying checkout — an operator placing a second order for the
   * same customer is doing the opposite. And a delivery fee is given rather than quoted, because an
   * operator taking a telephone order is the one quoting it.
   */
  async createManualOrder(input: ManualOrderInput): Promise<{ id: string; orderNumber: string }> {
    const {
      customerId,
      address,
      paymentMethod,
      shippingMethod,
      deliveryFeeMode,
      deliveryFee,
      adminNote,
      lines: requested,
      actor,
      meta,
    } = input;
    const cod = paymentMethod === "COD";

    return this.db.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } });
      if (!customer) throw new OrderRuleViolation("CUSTOMER_NOT_FOUND", "مشتری پیدا نشد");

      const variants = await tx.variant.findMany({
        where: { id: { in: requested.map((line) => line.variantId) } },
        include: { product: { select: { id: true, name: true } } },
      });
      const byId = new Map(variants.map((v) => [v.id, v]));
      if (byId.size !== new Set(requested.map((line) => line.variantId)).size) {
        throw new OrderRuleViolation("VARIANT_NOT_FOUND", "یکی از تنوع‌ها پیدا نشد");
      }

      const lines = requested.map((line) => {
        const variant = byId.get(line.variantId)!;
        if (!Number.isFinite(variant.price) || variant.price < 0) {
          throw new OrderRuleViolation("INVALID_PRICE", "قیمت تنوع نامعتبر است");
        }
        return { ...line, variant };
      });

      const orderNumber = await nextOrderNumber(tx);
      const subtotal = lines.reduce((sum, line) => sum + line.variant.price * line.qty, 0);
      const fee = Number.isFinite(deliveryFee) && deliveryFee > 0 ? deliveryFee : 0;

      const order = await tx.order.create({
        data: {
          orderNumber,
          customerId,
          shippingAddress: address as never,
          fulfillmentStatus: "PENDING",
          // Cash on delivery is paid at the counter, so the order is born settled. Everything else waits
          // for money the gateway has not seen.
          paymentStatus: cod ? "PAID" : "AWAITING",
          paymentMethod,
          shippingMethod,
          deliveryFeeMode,
          subtotal,
          discountAmount: 0,
          deliveryFee: fee,
          total: subtotal + fee,
          currency: "TOMAN",
          adminNote,
          placedAt: new Date(),
          items: {
            create: lines.map(({ variant, qty }) => ({
              productId: variant.productId,
              variantId: variant.id,
              productName: variant.product.name,
              colorName: variant.colorName,
              sku: variant.sku,
              unitPrice: variant.price,
              quantity: qty,
              lineTotal: variant.price * qty,
              image: variant.images[0] ?? null,
            })),
          },
          events: {
            create: [
              { dimension: "FULFILLMENT", from: "", to: "PENDING", actor, note: "سفارش دستی" },
              ...(cod
                ? [{ dimension: "PAYMENT" as const, from: "AWAITING", to: "PAID", actor, note: "پرداخت هنگام ثبت (COD)" }]
                : []),
            ],
          },
        },
      });

      // The transaction's client, for the reason the checkout gives: a hold taken on another connection
      // cannot see an order row this transaction has not committed, and its foreign key fails.
      await reserveStock(
        order.id,
        lines.map(({ variant, qty }) => ({
          variantId: variant.id,
          qty,
          allowBackorder: variant.allowBackorder,
        })),
        paymentMethod,
        input.reserveWindow,
        tx,
      );
      if (cod) await commitStock(order.id, tx);

      await writeAudit(tx, {
        adminUserId: meta?.adminUserId ?? null,
        action: "ORDER_CREATED_MANUAL",
        entityType: "ORDER",
        entityId: order.id,
        ip: meta?.ip ?? null,
        userAgent: meta?.userAgent ?? null,
        meta: { orderNumber, subtotal, total: subtotal + fee, paymentMethod },
      });

      return { id: order.id, orderNumber };
    }, { timeout: 15_000 });
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
        label: orderEventLabel(event.dimension, event.to),
        actor: event.actor,
        note: event.note,
        at: event.at.toISOString(),
      })),
      transitions: {
        fulfillment: [...allowedTransitions("FULFILLMENT", row.fulfillmentStatus)],
        payment: [...allowedTransitions("PAYMENT", row.paymentStatus)],
      },
      paymentMethod: row.paymentMethod,
      paymentMethodLabel: paymentMethodLabel(row.paymentMethod),
      subtotal: row.subtotal,
      subtotalFormatted: formatToman(row.subtotal),
      discountAmount: row.discountAmount,
      discountAmountFormatted: formatToman(row.discountAmount),
      deliveryFee: row.deliveryFee,
      deliveryFeeLabel: row.deliveryFee === 0 ? "رایگان" : formatToman(row.deliveryFee),
      shippingAddress: toShippingAddress(row.shippingAddress),
    };
  }

  /**
   * The operator's view of one order.
   *
   * Built on the shopper's read model rather than beside it, so the items, the events, the money's
   * parts and — the part that matters — the legal transitions are one implementation. The transitions
   * are resolved here from the same table `POST /orders/:id/status` enforces, so a status form
   * rendered from this answer cannot offer a step the server will refuse.
   */
  private toAdminDetail(row: OrderAdminRow): OrderAdminDetail {
    return {
      ...this.toDetail(row),
      customerId: row.customerId,
      customer: row.customer,
      shippingMethod: row.shippingMethod,
      deliveryFeeMode: row.deliveryFeeMode,
      gatewayRefId: row.gatewayRefId,
      shippingTracking: row.shippingTracking,
      adminNote: row.adminNote,
      reservations: row.reservations.map((reservation) => ({
        id: reservation.id,
        qty: reservation.qty,
        status: reservation.status,
        expiresAt: reservation.expiresAt.toISOString(),
      })),
    };
  }
}

/**
 * The address snapshot, as the six things an order page prints.
 *
 * A `Json` column is not a record of strings, and the panel asserted it was one. So each key is read
 * as what it is or as nothing: an order placed before an address gained a field renders that line
 * absent rather than as the word "undefined" in the middle of a delivery address.
 */
function toShippingAddress(snapshot: unknown): OrderShippingAddress {
  const record = (typeof snapshot === "object" && snapshot !== null ? snapshot : {}) as Record<
    string,
    unknown
  >;
  const text = (key: string): string | null => {
    const value = record[key];
    return typeof value === "string" && value.trim() !== "" ? value : null;
  };
  return {
    province: text("province"),
    city: text("city"),
    addressLine: text("addressLine"),
    recipientName: text("recipientName"),
    recipientPhone: text("recipientPhone"),
    postalCode: text("postalCode"),
  };
}

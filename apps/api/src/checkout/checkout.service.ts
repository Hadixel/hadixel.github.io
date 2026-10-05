// Placing an order, and quoting one before it is placed.
//
// Every rule about whether an order is *allowed* lives here or in a module beside this one, and none of
// it lives in a client. That is the whole of what this slice is for: the storefront's checkout handler
// had five delivery rules inlined in it, the city/province agreement check existed only on the preview
// path and not on the path that actually created the order, and the panel's manual-order form computed
// its own totals. A shopper could be quoted a price on one path and charged a different one on the
// other, and the code that decided which was correct was a route handler.
//
// The preview and the create path call the same functions in the same order. A quote is not a
// separate, cheaper set of rules that happens to agree with the real ones; it is the first half of the
// same computation.

import { Inject, Injectable } from "@nestjs/common";
import { cityBelongsToProvince } from "@kmodern/contracts";
import { reserveStock } from "../inventory/inventory.service.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { createPrismaClient } from "../prisma/index.js";
import { applyDiscounts } from "./discounts.js";
import { nextOrderNumber } from "./order-number.js";
import { assignShippingMethod, type ShippingLine } from "./shipping.js";
import { computeTotals, subtotalOf, type OrderTotals } from "./totals.js";
import {
  COD_REFUSAL_MESSAGES,
  UNPAID_ORDER_MESSAGE,
  cashOnDeliveryAllowed,
  codCeiling,
  hasUnpaidOrder,
} from "./checkout-rules.js";
import {
  CityProvinceMismatch,
  CheckoutRuleViolation,
  InsufficientStockForOrder,
  UnknownVariant,
  UnpaidOrderExists,
} from "./exceptions/checkout.exception.js";
import type { CartLine, CheckoutQuote, EnrichedCart, EnrichedLine, PlacedOrder } from "./dto/checkout.dto.js";

type Db = ReturnType<typeof createPrismaClient>;

@Injectable()
export class CheckoutService {
  constructor(@Inject(DATA_CLIENT) private readonly db: Db) {}

  /**
   * Price a basket for a destination, without placing anything.
   *
   * Reads the live variants rather than trusting the prices in the request, so a quote cannot be
   * produced for a price the shopper chose.
   */
  async quote(input: {
    address: { province: string; city: string };
    items: { variantId: string; qty: number }[];
    customerId?: string;
    couponCode?: string;
  }): Promise<CheckoutQuote> {
    this.assertCityMatchesProvince(input.address.province, input.address.city);
    const lines = await this.priceLines(input.items);
    const totals = await this.totalFor(lines, input.address, input.customerId, input.couponCode);
    return {
      totals,
      weightKg: lines.reduce((sum, line) => sum + line.weightKg * line.qty, 0),
    };
  }

  /**
   * Create the order.
   *
   * One transaction for the order row, its items, the stock hold and the opening status event, so an
   * order cannot exist without its hold and a hold cannot exist without its order. The rules run before
   * it opens, because a rule that is checked inside the transaction and then throws has already done
   * work it will roll back.
   */
  async placeOrder(input: {
    customerId: string;
    address: {
      recipientName: string;
      recipientPhone: string;
      province: string;
      city: string;
      addressLine: string;
      postalCode: string;
      isDefault?: boolean;
      label?: string;
    };
    items: { variantId: string; qty: number }[];
    paymentMethod: "ONLINE" | "CARD_TO_CARD" | "COD";
    couponCode?: string;
  }): Promise<PlacedOrder> {
    // The agreement check, on the path that creates the order. It used to exist only on the preview
    // path, so calling the create endpoint directly skipped it entirely.
    this.assertCityMatchesProvince(input.address.province, input.address.city);

    const lines = await this.priceLines(input.items);
    const totals = await this.totalFor(
      lines,
      { province: input.address.province, city: input.address.city },
      input.customerId,
      input.couponCode,
    );

    if (input.paymentMethod === "COD") {
      const refusal = cashOnDeliveryAllowed(
        totals.shippingMethod,
        totals.total,
        await codCeiling(this.db),
      );
      if (!refusal.ok) throw new CheckoutRuleViolation(COD_REFUSAL_MESSAGES[refusal.reason]);
    }

    // One unpaid order at a time, whatever the method. A coupon that was refused still prices the
    // order — a shopper who mistyped a code should be able to check out without it.
    if (await hasUnpaidOrder(this.db, input.customerId)) {
      throw new UnpaidOrderExists(UNPAID_ORDER_MESSAGE);
    }

    return this.db.$transaction(async (tx) => {
      const orderNumber = await nextOrderNumber(tx);
      const order = await tx.order.create({
        data: {
          orderNumber,
          customerId: input.customerId,
          shippingAddress: input.address as never,
          fulfillmentStatus: "PENDING",
          paymentStatus: "AWAITING",
          paymentMethod: input.paymentMethod,
          shippingMethod: totals.shippingMethod,
          deliveryFeeMode: totals.deliveryFeeMode,
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          appliedDiscounts: totals.appliedDiscounts as never,
          deliveryFee: totals.deliveryFee,
          total: totals.total,
          currency: "TOMAN",
          items: {
            create: lines.map((line) => ({
              productId: line.productId,
              variantId: line.variantId,
              productName: line.productName,
              colorName: line.colorName,
              sku: line.sku ?? "",
              unitPrice: line.price,
              quantity: line.qty,
              lineTotal: line.price * line.qty,
              image: line.image,
            })),
          },
        },
      });

      // Every method is held, and the window is the merchant's. Cash on delivery is held rather than
      // sold: the money has not changed hands, so the units are still only promised, and the hold
      // expires on its own if the delivery does not happen. The operator commits it when the order is
      // marked paid, which is the same transition every other paid order goes through.
      //
      // The transaction's client is passed in deliberately. Without it the hold is taken on another
      // connection, which cannot see the order row this transaction has not committed yet — so the
      // reservation's foreign key fails and the order is left with no hold at all.
      await reserveStock(
        order.id,
        lines.map((line) => ({
          variantId: line.variantId,
          qty: line.qty,
          allowBackorder: line.allowBackorder,
        })),
        input.paymentMethod,
        undefined,
        tx,
      );

      await tx.orderStatusEvent.create({
        data: {
          orderId: order.id,
          dimension: "FULFILLMENT",
          from: "",
          to: "PENDING",
          actor: "CUSTOMER",
          note: "سفارش ثبت شد",
        },
      });

      return {
        id: order.id,
        orderNumber,
        total: order.total,
        paymentMethod: input.paymentMethod,
        shippingMethod: totals.shippingMethod,
        deliveryFee: totals.deliveryFee,
        couponError: totals.couponError,
      };
    });
  }

  /**
   * Resolve a basket against live variants.
   *
   * A variant that is not there is refused rather than skipped: a basket line the gateway cannot price
   * is a basket the customer believes is orderable, and dropping it silently is how an order arrives
   * missing something.
   */
  private async priceLines(items: { variantId: string; qty: number }[]): Promise<CartLine[]> {
    const wanted = items.map((item) => item.variantId);
    const variants = await this.db.variant.findMany({
      where: { id: { in: wanted } },
      include: { product: { include: { category: true } } },
    });
    const byId = new Map(variants.map((variant) => [variant.id, variant]));

    const lines: CartLine[] = [];
    for (const item of items) {
      const variant = byId.get(item.variantId);
      if (!variant) throw new UnknownVariant();
      // The whole order is refused if any non-backorder line is short, rather than trimming the line
      // to what is available. A shopper who asked for three and is sent two has not been given what
      // they ordered, and finding that out at the door is worse than being told now.
      const available = variant.stock - variant.reserved;
      if (!variant.allowBackorder && available < item.qty) {
        throw new InsufficientStockForOrder();
      }
      lines.push({
        variantId: variant.id,
        qty: item.qty,
        price: variant.price,
        productId: variant.productId,
        productName: variant.product.name,
        categoryId: variant.product.categoryId,
        colorName: variant.colorName,
        sku: variant.sku,
        image: variant.images[0] ?? null,
        weightKg: variant.product.category.weightKg,
        allowBackorder: variant.allowBackorder,
      });
    }
    return lines;
  }

  /** The one path from a basket to a number, used by the quote and by the order alike. */
  private async totalFor(
    lines: CartLine[],
    address: { province: string; city: string },
    customerId: string | undefined,
    couponCode: string | undefined,
  ): Promise<OrderTotals> {
    const subtotal = subtotalOf(lines);
    const discount = await applyDiscounts(
      this.db,
      {
        subtotal,
        productIds: [...new Set(lines.map((line) => line.productId))],
        categoryIds: [...new Set(lines.map((line) => line.categoryId))],
        collectionIds: [],
        ...(customerId ? { customerId } : {}),
      },
      couponCode,
    );
    const shippingLines: ShippingLine[] = lines.map((line) => ({
      variantId: line.variantId,
      qty: line.qty,
      weightKg: line.weightKg,
    }));
    const shipping = await assignShippingMethod(
      this.db,
      address.province,
      address.city,
      shippingLines,
    );
    return computeTotals(lines, discount, shipping);
  }

  /**
   * Resolve a stored basket into something drawable.
   *
   * A cart cookie is a list of variant ids the browser kept, so it ages: a variant can be unpublished,
   * a price can move, a line can sell out. This reads the live rows and reports what each line is now,
   * including the lines it could not resolve — a cart that silently drops a missing item is a cart
   * that quietly changes the order, and the shopper only finds out at the till.
   */
  async enrichCart(
    items: { variantId: string; qty: number }[],
  ): Promise<EnrichedCart> {
    const wanted = items.map((item) => item.variantId);
    const variants = await this.db.variant.findMany({
      where: { id: { in: wanted } },
      include: { product: { select: { id: true, name: true, slug: true } } },
    });
    const byId = new Map(variants.map((variant) => [variant.id, variant]));

    const lines: EnrichedLine[] = [];
    const unavailable: { variantId: string; qty: number }[] = [];
    let subtotal = 0;
    let totalCount = 0;

    for (const item of items) {
      const variant = byId.get(item.variantId);
      if (!variant) {
        unavailable.push({ variantId: item.variantId, qty: item.qty });
        continue;
      }
      const free = Math.max(variant.stock - variant.reserved, 0);
      const available = free > 0 || variant.allowBackorder;
      // Capped at what can actually be added, so a cart holding ten of a line with three free cannot
      // be drawn as though ten were orderable.
      const maxAddable = variant.allowBackorder ? 99 : Math.min(free, 99);
      const lineTotal = variant.price * item.qty;
      subtotal += lineTotal;
      totalCount += item.qty;
      lines.push({
        variantId: variant.id,
        productId: variant.product.id,
        slug: variant.product.slug,
        productName: variant.product.name,
        colorName: variant.colorName,
        sku: variant.sku,
        price: variant.price,
        qty: item.qty,
        lineTotal,
        image: variant.images[0] ?? null,
        available,
        maxAddable,
      });
    }

    return { lines, subtotal, totalCount, unavailable };
  }

  private assertCityMatchesProvince(province: string, city: string): void {
    if (!cityBelongsToProvince(province, city)) throw new CityProvinceMismatch();
  }
}

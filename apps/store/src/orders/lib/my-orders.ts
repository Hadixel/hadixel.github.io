// The signed-in shopper's own orders, as the gateway serves them.
//
// Two pages render an order list and one renders an order, and all three used to query the database
// themselves and then translate what came back: an item count summed in the page, a status turned
// into a badge key beside a Persian label the page also owned, and totals formatted with the
// storefront's own formatter. So three pages held three renderings of the same row.
//
// The gateway's read model is the rendering. What is left here is the two questions the pages ask of
// it, and — for the one that can come back empty — the distinction between "there is no such order"
// and "the gateway could not tell", which is not a distinction to re-derive at each call site.

import { GatewayError, gateway } from "@/lib/gateway";
import { orderStatusKey, type OrderRowData } from "@/orders/components/order-row";

/** How many orders a shopper's history page shows. The gateway bounds the page; this is the ask. */
const HISTORY_SIZE = 50;

/** One row of a shopper's order list, as `/orders` and the account page print it. */
export interface OrderSummary {
  id: string;
  orderNumber: string;
  /** ISO. The page renders it in the shop's calendar, which is the page's own decision. */
  placedAt: string;
  itemCount: number;
  total: number;
  totalFormatted: string;
  fulfillmentStatus: string;
  paymentStatus: string;
}

/** One order, in the shape `/order/[orderNumber]` renders. */
export interface ShopperOrder {
  id: string;
  orderNumber: string;
  placedAt: string;
  /** Persian, resolved by the gateway: this page used to hold its own copy of these maps. */
  fulfillmentLabel: string;
  paymentLabel: string;
  paymentMethod: string;
  paymentMethodLabel: string;
  subtotalFormatted: string;
  discountAmount: number;
  discountAmountFormatted: string;
  deliveryFeeLabel: string;
  totalFormatted: string;
  shippingAddress: {
    province: string | null;
    city: string | null;
    addressLine: string | null;
    recipientName: string | null;
    recipientPhone: string | null;
    postalCode: string | null;
  };
  /**
   * The raw statuses, for the two branches this page takes on them. They are never compared to a
   * label: a display string that changed would silently stop the pay button from appearing.
   */
  fulfillmentStatus: string;
  paymentStatus: string;
  items: {
    productName: string;
    colorName: string | null;
    quantity: number;
    lineTotalFormatted: string;
    image: string | null;
  }[];
  events: { dimension: string; to: string; label: string; note: string | null; at: string }[];
}

/**
 * A shopper's orders, newest first, and how many they have in all.
 *
 * `total` is the shop-wide-for-this-customer count rather than the length of this page, so an
 * account page can say "you have 63 orders" over the fifty it was sent. It used to count the rows it
 * had been given, which reports a customer with a long history as having exactly fifty.
 */
export async function readMyOrders(): Promise<{ orders: OrderSummary[]; total: number }> {
  const client = await gateway();
  return client.get<{ orders: OrderSummary[]; total: number }>("/orders/mine", {
    query: { limit: HISTORY_SIZE },
  });
}

/** The account page's four most recent orders, in the shape an order row takes. */
export function recentOrderRows(orders: OrderSummary[]): OrderRowData[] {
  return orders.slice(0, 4).map(toOrderRow);
}

/** Every order the history page prints, in the shape an order row takes. */
export function orderRows(orders: OrderSummary[]): OrderRowData[] {
  return orders.map(toOrderRow);
}

function toOrderRow(order: OrderSummary): OrderRowData {
  return {
    orderNumber: order.orderNumber,
    placedAt: order.placedAt,
    itemCount: order.itemCount,
    total: order.total,
    // The badge's key is a presentation decision — which of four looks this row gets — and the
    // component is where the four looks live, so this is the one status derivation left in the
    // storefront. The words on the badge are the gateway's.
    statusKey: orderStatusKey({ fulfillmentStatus: order.fulfillmentStatus, paymentStatus: order.paymentStatus }),
  };
}

/**
 * One of the caller's orders, and which of the answers this is.
 *
 * Two answers, and a throw for everything else. A 404 means the order is not there or is not this
 * shopper's, and the route should render not-found. A transport failure or a 500 is not a third
 * answer to be flattened into the first: the order is very probably there, and answering "not found"
 * to a gateway blip turns five minutes of outage into a shopper being told that the order they are
 * looking at does not exist. So it throws and reaches the error boundary, and this union has no
 * member standing in for that — a caller cannot reach `notFound()` by accident.
 */
export type OrderLookup =
  | { kind: "ok"; order: ShopperOrder }
  | { kind: "missing" };

export async function readMyOrderByNumber(orderNumber: string): Promise<OrderLookup> {
  try {
    const client = await gateway();
    const order = await client.get<ShopperOrder>(
      `/shopper/orders/by-number/${encodeURIComponent(orderNumber)}`,
    );
    return { kind: "ok", order };
  } catch (error) {
    if (error instanceof GatewayError && error.statusCode === 404) return { kind: "missing" };
    // An outage is re-thrown rather than answered: a page whose subject is somebody's order is
    // better served by the error boundary and a retry than by a lie about what they bought.
    throw error;
  }
}

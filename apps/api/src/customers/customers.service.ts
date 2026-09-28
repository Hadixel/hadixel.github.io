// The panel's view of a customer: the list an operator searches, and one customer's own history.
//
// Both were queries written in the panel's pages — three tables for the list, a count beside the
// rows, and an aggregate over one customer's orders. That made the page and the meaning of "a
// customer" the same file: the search is an OR over name, phone and email, and an OR written next to
// a table is an OR nothing else can be held to. It is here now, and the page names what it wants.

import { Inject, Injectable } from "@nestjs/common";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

/**
 * How many of a customer's orders the detail page shows.
 *
 * Bounded, and the count beside it is the whole number rather than this one: the page says "showing
 * the last 50" only because the aggregate is here to tell it that there are more. A list that grows
 * with the customer is a list that eventually answers with a customer's entire order history.
 */
const RECENT_ORDERS = 50;

/** One customer as the list renders it: who they are, and how much of them there is. */
export interface CustomerSummary {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  orderCount: number;
  joinedAt: Date;
}

/** One page of customers, with the count the header renders. */
export interface CustomerListPage {
  rows: CustomerSummary[];
  total: number;
  page: number;
  size: number;
}

/** One address, as the detail page renders it. Flat, because an address has no relations of its own. */
export interface CustomerAddress {
  id: string;
  recipientName: string;
  recipientPhone: string;
  province: string;
  city: string;
  addressLine: string;
  postalCode: string;
  isDefault: boolean;
}

/** One of the customer's most recent orders, as the detail page's table renders it. */
export interface CustomerRecentOrder {
  id: string;
  orderNumber: string;
  placedAt: Date;
  fulfillmentStatus: string;
  paymentStatus: string;
  total: number;
}

/**
 * One customer, whole.
 *
 * `orderCount` and `totalSpend` are aggregates over *every* order the customer has, while
 * `recentOrders` is the newest slice of them. The page needs both: the aggregates are what the
 * header claims and the slice is what it lists, and computing the header from the slice is how a
 * customer with 60 orders comes to look like one with 50.
 */
export interface CustomerDetail {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  smsMarketingConsent: boolean;
  joinedAt: Date;
  orderCount: number;
  totalSpend: number;
  addresses: CustomerAddress[];
  recentOrders: CustomerRecentOrder[];
}

@Injectable()
export class CustomersService {
  constructor(@Inject(DATA_CLIENT) private readonly db: PrismaClient) {}

  /**
   * The customer list, newest first, paged, with the count the header shows.
   *
   * `name` and `email` are matched without regard to case and `phone` is not, and that asymmetry is
   * the panel's predicate carried over whole rather than tidied: a phone number in this shop is
   * Persian digits or ASCII and never letters, so case cannot change what it matches, while
   * `Ali@` and `ali@` are the same address to every operator and to the mail server. Making the
   * phone arm case-insensitive as well would be a change of meaning dressed as a tidy-up, and it
   * would make this read disagree with whatever else searches by phone.
   */
  async list(input: { q?: string; page: number; size: number }): Promise<CustomerListPage> {
    const q = input.q?.trim();
    const where: Prisma.CustomerWhereInput = q ? matchesSearch(q) : {};
    const skip = (input.page - 1) * input.size;

    const [rows, total] = await Promise.all([
      this.db.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: input.size,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
      }),
      this.db.customer.count({ where }),
    ]);

    return {
      // The count is the page's column, flattened here rather than left as `_count.orders` for the
      // JSX to reach into: a read that answers with the shape the table renders leaves nothing for
      // the page to translate.
      rows: rows.map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email,
        joinedAt: row.createdAt,
        orderCount: row._count.orders,
      })),
      total,
      page: input.page,
      size: input.size,
    };
  }

  /**
   * One customer with their addresses and their most recent orders, or null.
   *
   * Null rather than a 404, so the controller owns the exception and the service stays a read. The
   * customer's own spending is aggregated rather than summed from `recentOrders`, for the reason the
   * type above names.
   */
  async detail(id: string): Promise<CustomerDetail | null> {
    const [customer, totals] = await Promise.all([
      this.db.customer.findUnique({
        where: { id },
        include: {
          addresses: { orderBy: { isDefault: "desc" } },
          // `placedAt` rather than `createdAt`: the page's column is when the order was placed, and
          // the two are only ever different for an order that was imported with a backdated
          // `createdAt`, where the newer-looking one is the wrong answer to "recent".
          orders: { orderBy: { placedAt: "desc" }, take: RECENT_ORDERS },
        },
      }),
      this.db.order.aggregate({
        where: { customerId: id },
        _count: { _all: true },
        _sum: { total: true },
      }),
    ]);

    if (!customer) return null;

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      smsMarketingConsent: customer.smsMarketingConsent,
      joinedAt: customer.createdAt,
      orderCount: totals._count._all,
      // A customer with no orders spends nothing, and `null` out of `SUM` is that answer written as
      // an absence. The page formats the number, so it is a number here.
      totalSpend: totals._sum.total ?? 0,
      addresses: customer.addresses.map((address) => ({
        id: address.id,
        recipientName: address.recipientName,
        recipientPhone: address.recipientPhone,
        province: address.province,
        city: address.city,
        addressLine: address.addressLine,
        postalCode: address.postalCode,
        isDefault: address.isDefault,
      })),
      recentOrders: customer.orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        placedAt: order.placedAt,
        fulfillmentStatus: order.fulfillmentStatus,
        paymentStatus: order.paymentStatus,
        total: order.total,
      })),
    };
  }
}

/**
 * The search, as the panel's own search box meant it.
 *
 * One OR over the three fields the box names, and the two case-insensitive arms are the ones that
 * need it. Private to this module, because a predicate with a second caller is a predicate somebody
 * will answer a different question with.
 */
function matchesSearch(q: string): Prisma.CustomerWhereInput {
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { email: { contains: q, mode: "insensitive" } },
    ],
  };
}

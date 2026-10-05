import { toFaDigits,formatJalaliDateTime } from "@kmodern/contracts";
// The order table, read through the gateway.
//
// This page used to import the data tier and run two queries of its own — a page of orders and the
// total for the pager — over a `where` it assembled out of its own `searchParams`. Both are one
// gateway read now, answered together: a total fetched beside the rows it describes can disagree with
// them.
//
// The filters travel as a query string. Which columns the search box covers — an order number or a
// customer's phone, either case — is the gateway's to say, and the page says nothing about it beyond
// carrying what the operator typed. The gateway's `limit` is bounded and this page names its own page
// size within that bound, so the slice the pager divides by is the slice the gateway read.
//
// A read that fails fails the page. A silent empty table here is an operator deciding a shop has no
// orders and a customer service answer built on that.

import Link from "next/link";
import { formatToman } from "@kmodern/contracts/format";
import { readThrough } from "@/lib/reads";
import { Button, Card, CardHeader, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@kmodern/ui";
import { EmptyState, Pagination } from "@/components/panel-ui";
import { STATUS_LABELS, StatusBadge } from "@/components/status";
import { enumParam, pageParam } from "@/lib/pagination";

/** The page size the table renders. Named here and sent as a bounded value; the gateway clamps it. */
const PAGE_SIZE = 25;
const FULFILLMENT_STATUSES = ["ALL", "PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"];
const PAYMENT_STATUSES = ["ALL", "AWAITING", "PAID", "REFUNDED", "FAILED"];

/** One page of the order table, as the gateway's `GET /orders` answers. */
interface OrderPage {
  orders: {
    id: string;
    orderNumber: string;
    fulfillmentStatus: string;
    paymentStatus: string;
    /** The server's own total. Rendered as it came, with no factor applied on the way. */
    total: number;
    placedAt: string;
    paymentMethod: string;
    customer: { id: string; name: string | null; phone: string };
  }[];
  total: number;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; payment?: string; search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = pageParam(params.page);
  const fulfillment = enumParam(params.status, ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"]);
  const payment = enumParam(params.payment, ["AWAITING", "PAID", "REFUNDED", "FAILED"]);
  const search = params.search?.trim();

  // The filters on their own — no page — because the form must submit a fresh search onto page one.
  const baseQs = new URLSearchParams({
    ...(fulfillment ? { status: fulfillment } : {}),
    ...(payment ? { payment: payment } : {}),
    ...(search ? { search } : {}),
  });

  const query = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String((page - 1) * PAGE_SIZE),
    ...(fulfillment ? { fulfillmentStatus: fulfillment } : {}),
    ...(payment ? { paymentStatus: payment } : {}),
    ...(search ? { q: search } : {}),
  });

  const { orders, total } = await readThrough<OrderPage>(`/orders?${query.toString()}`);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = Boolean(fulfillment || payment || search);

  const basePath = hasFilters ? `/orders?${baseQs.toString()}` : "/orders";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">سفارش‌ها</h2>
            {total ? <p className="mt-0.5 text-sm text-ash">{`${toFaDigits(total)} سفارش`}</p> : null}
          </div>
          <div className="shrink-0">
            <Button asChild>
              <Link href="/orders/new">سفارش جدید</Link>
            </Button>
          </div>
        </CardHeader>
        <div className="border-b border-plaster px-5 py-3">
          <form action="/orders" method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-ash">جستجوی شماره سفارش</label>
              <input aria-label="جستجوی شماره سفارش" name="search" defaultValue={search} placeholder="مثلاً 1404-000042" className="w-48 form-control" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ash">وضعیت اجرا</label>
              <select aria-label="فیلتر وضعیت اجرا" name="status" defaultValue={fulfillment ?? "ALL"} className="form-control">
                {FULFILLMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s === "ALL" ? "همه" : STATUS_LABELS[s] ?? s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-ash">وضعیت پرداخت</label>
              <select aria-label="فیلتر وضعیت پرداخت" name="payment" defaultValue={payment ?? "ALL"} className="form-control">
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s === "ALL" ? "همه" : STATUS_LABELS[s] ?? s}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="outline">اعمال فیلتر</Button>
              {hasFilters && (
                <Link href="/orders" className="inline-flex items-center rounded-card px-3 py-2 text-sm text-ash hover:bg-plaster">
                  حذف فیلترها
                </Link>
              )}
            </div>
          </form>
        </div>

        {orders.length === 0 ? (
          <EmptyState text="سفارشی یافت نشد" />
        ) : (
          <div role="region" aria-label="جدول داده‌ها" tabIndex={0} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flame-300">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>شماره</TableHead>
                  <TableHead>مشتری</TableHead>
                  <TableHead>مبلغ</TableHead>
                  <TableHead>روش پرداخت</TableHead>
                  <TableHead>پرداخت</TableHead>
                  <TableHead>اجرا</TableHead>
                  <TableHead>تاریخ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link href={`/orders/${o.id}`} className="text-ink hover:text-flame-700">{o.orderNumber}</Link>
                    </TableCell>
                    <TableCell>{o.customer.name || o.customer.phone}</TableCell>
                    <TableCell>{formatToman(o.total)}</TableCell>
                    <TableCell className="text-xs">{o.paymentMethod}</TableCell>
                    <TableCell><StatusBadge status={o.paymentStatus} /></TableCell>
                    <TableCell><StatusBadge status={o.fulfillmentStatus} /></TableCell>
                    {/* The date crossed as a string; the renderer's own parser takes a Date. */}
                    <TableCell className="text-xs text-ash">{formatJalaliDateTime(new Date(o.placedAt))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Pagination page={page} totalPages={totalPages} basePath={hasFilters ? basePath : "/orders"} />
    </div>
  );
}

import Link from "next/link";
import { db } from "@kmodern/db";
import { formatToman } from "@kmodern/schema/format";
import { faDigits, formatJalaliDateTime } from "@/lib/date";
import { Button, Card, CardHeader, EmptyState, Pagination, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { STATUS_LABELS, StatusBadge } from "@/components/status";
import { enumParam, pageParam } from "@/lib/pagination";

const PAGE_SIZE = 25;
const FULFILLMENT_STATUSES = ["ALL", "PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"];
const PAYMENT_STATUSES = ["ALL", "AWAITING", "PAID", "REFUNDED", "FAILED"];

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

  const where = {
    ...(fulfillment ? { fulfillmentStatus: fulfillment as never } : {}),
    ...(payment ? { paymentStatus: payment as never } : {}),
    ...(search ? { orderNumber: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const [orders, total] = await Promise.all([
    db().order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { customer: { select: { name: true, phone: true } } },
    }),
    db().order.count({ where }),
  ]);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = Boolean(fulfillment || payment || search);

  const basePath = hasFilters
    ? `/orders?${new URLSearchParams({
        ...(fulfillment ? { status: fulfillment } : {}),
        ...(payment ? { payment: payment } : {}),
        ...(search ? { search } : {}),
      })}`
    : "/orders";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="سفارش‌ها"
          subtitle={total ? `${faDigits(total)} سفارش` : undefined}
          actions={
            <Button asChild>
              <Link href="/orders/new">سفارش جدید</Link>
            </Button>
          }
        />
        <div className="border-b border-plaster px-5 py-3">
          <form action="/orders" method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-ash">جستجوی شماره سفارش</label>
              <input aria-label="جستجوی شماره سفارش" name="search" defaultValue={search} placeholder="مثلاً 1404-000042" className="w-48 rounded-card border border-fog px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ash">وضعیت اجرا</label>
              <select aria-label="فیلتر وضعیت اجرا" name="status" defaultValue={fulfillment ?? "ALL"} className="rounded-card border border-fog px-3 py-2 text-sm">
                {FULFILLMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s === "ALL" ? "همه" : STATUS_LABELS[s] ?? s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-ash">وضعیت پرداخت</label>
              <select aria-label="فیلتر وضعیت پرداخت" name="payment" defaultValue={payment ?? "ALL"} className="rounded-card border border-fog px-3 py-2 text-sm">
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s === "ALL" ? "همه" : STATUS_LABELS[s] ?? s}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary">اعمال فیلتر</Button>
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
          <Table>
            <THead>
              <TR>
                <TH>شماره</TH>
                <TH>مشتری</TH>
                <TH>مبلغ</TH>
                <TH>روش پرداخت</TH>
                <TH>پرداخت</TH>
                <TH>اجرا</TH>
                <TH>تاریخ</TH>
              </TR>
            </THead>
            <TBody>
              {orders.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <Link href={`/orders/${o.id}`} className="text-ink hover:text-flame-700">{o.orderNumber}</Link>
                  </TD>
                  <TD>{o.customer.name || o.customer.phone}</TD>
                  <TD>{formatToman(o.total)}</TD>
                  <TD className="text-xs">{o.paymentMethod}</TD>
                  <TD><StatusBadge status={o.paymentStatus} /></TD>
                  <TD><StatusBadge status={o.fulfillmentStatus} /></TD>
                  <TD className="text-xs text-ash">{formatJalaliDateTime(o.placedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Pagination page={page} totalPages={totalPages} basePath={hasFilters ? basePath : "/orders"} />
    </div>
  );
}
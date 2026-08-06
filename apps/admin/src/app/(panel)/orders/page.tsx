import Link from "next/link";
import { db } from "@kmodern/db";
import { formatToman } from "@kmodern/schema";
import { faDigits, formatJalaliDateTime } from "@/lib/date";
import { Button, Card, CardHeader, EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { StatusBadge } from "@/components/status";

const PAGE_SIZE = 25;
const FULFILLMENT_STATUSES = ["ALL", "PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"];
const PAYMENT_STATUSES = ["ALL", "AWAITING", "PAID", "REFUNDED", "FAILED"];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; payment?: string; search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const fulfillment = params.status && params.status !== "ALL" ? params.status : undefined;
  const payment = params.payment && params.payment !== "ALL" ? params.payment : undefined;
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
            <Link href="/orders/new">
              <Button>سفارش جدید</Button>
            </Link>
          }
        />
        <div className="border-b border-slate-100 px-5 py-3">
          <form action="/orders" method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">جستجوی شماره سفارش</label>
              <input name="search" defaultValue={search} placeholder="مثلاً 1404-000042" className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">وضعیت اجرا</label>
              <select name="status" defaultValue={fulfillment ?? "ALL"} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {FULFILLMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s === "ALL" ? "همه" : s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">وضعیت پرداخت</label>
              <select name="payment" defaultValue={payment ?? "ALL"} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s === "ALL" ? "همه" : s}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary">اعمال فیلتر</Button>
              {hasFilters && (
                <Link href="/orders" className="inline-flex items-center rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">
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
                    <Link href={`/orders/${o.id}`} className="text-rose-600 hover:underline">{o.orderNumber}</Link>
                  </TD>
                  <TD>{o.customer.name || o.customer.phone}</TD>
                  <TD>{formatToman(o.total)}</TD>
                  <TD className="text-xs">{o.paymentMethod}</TD>
                  <TD><StatusBadge status={o.paymentStatus} /></TD>
                  <TD><StatusBadge status={o.fulfillmentStatus} /></TD>
                  <TD className="text-xs text-slate-500">{formatJalaliDateTime(o.placedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {hasFilters ? (
        <Pager page={page} totalPages={totalPages} href={(p) => `${basePath}&page=${p}`} />
      ) : (
        <Pager page={page} totalPages={totalPages} href={(p) => `/orders?page=${p}`} />
      )}
    </div>
  );
}

function Pager({ page, totalPages, href }: { page: number; totalPages: number; href: (p: number) => string }) {
  if (totalPages <= 1) return null;
  const items = [];
  for (let p = 1; p <= totalPages; p++) {
    items.push(
      <Link
        key={p}
        href={href(p)}
        className={
          "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm " +
          (p === page ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50")
        }
      >
        {faDigits(p)}
      </Link>,
    );
  }
  return <footer className="flex items-center justify-center gap-1.5">{items}</footer>;
}
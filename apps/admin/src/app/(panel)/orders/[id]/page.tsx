import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@kmodern/db";
import { formatToman } from "@kmodern/schema/format";
import { faDigits, formatJalaliDateTime } from "@/lib/date";
import { Badge, Card, CardBody, CardHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { STATUS_LABELS, StatusBadge } from "@/components/status";
import { OrderStatusTransitions } from "./transitions";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await db().order.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      items: true,
      events: { orderBy: { at: "desc" } },
      reservations: true,
    },
  });
  if (!order) notFound();

  const address = (order.shippingAddress ?? {}) as Record<string, string>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/orders" className="text-sm text-ash hover:underline">سفارش‌ها</Link>
        <h1 className="text-xl font-bold text-ink">سفارش {order.orderNumber}</h1>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* status transitions */}
          <Card>
            <CardHeader title="وضعیت و انتقال" subtitle={`اجرا: ${STATUS_LABELS[order.fulfillmentStatus] ?? order.fulfillmentStatus} • پرداخت: ${STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}`} />
            <CardBody>
              <OrderStatusTransitions orderId={order.id} fulfilled={order.fulfillmentStatus} paid={order.paymentStatus} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="اقلام سفارش" subtitle={`${faDigits(order.items.length)} قلم`} />
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>محصول</TH>
                    <TH>تنوع</TH>
                    <TH>قیمت واحد</TH>
                    <TH>تعداد</TH>
                    <TH>جمع</TH>
                  </TR>
                </THead>
                <TBody>
                  {order.items.map((it) => (
                    <TR key={it.id}>
                      <TD>{it.productName}</TD>
                      <TD>{it.colorName || "—"}</TD>
                      <TD>{formatToman(it.unitPrice)}</TD>
                      <TD>{faDigits(it.quantity)}</TD>
                      <TD>{formatToman(it.lineTotal)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <div className="space-y-1 border-t border-plaster px-5 py-4 text-sm">
                <div className="flex justify-between"><span>جمع کالا</span><span>{formatToman(order.subtotal)}</span></div>
                <div className="flex justify-between"><span>تخفیف</span><span className="text-red-700">−{formatToman(order.discountAmount)}</span></div>
                <div className="flex justify-between"><span>ارسال</span><span>{formatToman(order.deliveryFee)}</span></div>
                <div className="flex justify-between border-t border-plaster pt-2 text-base font-bold"><span>قابل پرداخت</span><span>{formatToman(order.total)}</span></div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="رویدادها" subtitle="تاریخچهٔ وضعیت سفارش" />
            <CardBody className="p-0">
              {order.events.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ash">رویدادی ثبت نشده است</p>
              ) : (
                <ul className="divide-y divide-plaster">
                  {order.events.map((ev) => (
                    <li key={ev.id} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
                      <div>
                        <span className="ml-2 rounded bg-plaster px-2 py-0.5 text-xs font-medium">{ev.dimension === "FULFILLMENT" ? "اجرا" : "پرداخت"}</span>
                        <span dir="ltr" className="text-ink">{ev.from === "" ? "—" : ev.from} → {ev.to}</span>
                        {ev.note && <p className="mt-1 text-xs text-ash">{ev.note}</p>}
                      </div>
                      <div className="text-left text-xs text-ash">
                        <div>{ev.actor}</div>
                        <div>{formatJalaliDateTime(ev.at)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="مشتری" actions={<Link href={`/customers/${order.customerId}`} className="text-xs text-ink hover:text-flame-700">مشاهده</Link>} />
            <CardBody className="space-y-1 text-sm">
              <div className="font-medium text-ink">{order.customer.name || order.customer.phone}</div>
              <div dir="ltr" className="text-ash text-left">{order.customer.phone}</div>
              {order.customer.email && <div dir="ltr" className="text-left text-ash">{order.customer.email}</div>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="پرداخت" />
            <CardBody className="space-y-2 text-sm">
              <Row label="روش" value={order.paymentMethod} />
              <Row label="وضعیت پرداخت" value={<StatusBadge status={order.paymentStatus} />} />
              <Row label="روش ارسال" value={order.shippingMethod} />
              <Row label="نحوه ارسال" value={order.deliveryFeeMode} />
              {order.gatewayRefId && <Row label="کد رهگیری درگاه" value={order.gatewayRefId} />}
              {order.shippingTracking && <Row label="رهگیری" value={order.shippingTracking} />}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="آدرس گیرنده" />
            <CardBody className="space-y-1 text-sm">
              {address.province && address.city && (
                <p>{address.province} — {address.city}</p>
              )}
              <p>{address.addressLine}</p>
              {address.recipientName && <p>{address.recipientName}</p>}
              {address.recipientPhone && <p dir="ltr" className="text-left text-ash">{address.recipientPhone}</p>}
              {address.postalCode && <p dir="ltr" className="text-left text-ash">{address.postalCode}</p>}
              {!address.addressLine && <p className="text-ash">آدرسی ثبت نشده</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="رزروها" />
            <CardBody>
              {order.reservations.length === 0 ? (
                <p className="text-sm text-ash">رزروی ثبت نشده</p>
              ) : (
                <ul className="space-y-1 text-sm">{order.reservations.map((r) => (
                  <li key={r.id} className="flex justify-between"><span>تعداد {faDigits(r.qty)}</span><Badge color={r.status === "COMMITTED" ? "green" : r.status === "ACTIVE" ? "blue" : "gray"}>{r.status}</Badge></li>
                ))}</ul>
              )}
            </CardBody>
          </Card>

          {order.adminNote && (
            <Card>
              <CardHeader title="یادداشت ادمین" />
              <CardBody><p className="text-sm text-ink">{order.adminNote}</p></CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ash">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}
import { toFaDigits,formatJalaliDateTime } from "@kmodern/contracts";
// One order, for an operator, read through the gateway.
//
// This page used to import the data tier and run one `findUnique` with four `include`s over it, then
// cast the address snapshot to a `Record<string, string>` and read five keys off a `Json` column — a
// claim about the data that no client can check. It is a gateway read now, and the read answers this
// page's own shape: the customer beside the order, the address as six named fields, the parts the
// total is made of, and the stock holds behind it.
//
// The status form's options are the part worth stating. This page used to render a `<Select>` from a
// byte-identical copy of the transition table the server enforces, and the two were free to disagree
// about which step is legal from here. The gateway resolves the legal transitions from that same
// table and includes them on this read, so what the form offers is what the server will accept. There
// is no table on this side, and there is nothing to recompute: an order whose legal list is empty is
// a terminal one, and the gateway says so rather than this page guessing it.
//
// The money is rendered as the server sent it. The total was frozen in TOMAN when the order was
// placed, and a page that multiplied its way to a figure the server never wrote is how a shop and
// its own invoice end up disagreeing.

import Link from "next/link";
import { notFound } from "next/navigation";
import { formatToman } from "@kmodern/contracts/format";
import { readThrough } from "@/lib/reads";
import { Badge, Card, CardContent, CardHeader, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@kmodern/ui";
import { StatusBadge } from "@/components/status";
import { OrderStatusTransitions } from "@/orders/components/order-transitions";
import type { OrderTransitions } from "@/orders/lib/order-status";

/** One order in full, as the gateway's `GET /orders/:id` answers. */
interface OrderAdminDetail {
  id: string;
  orderNumber: string;
  customerId: string;
  customer: { id: string; name: string | null; phone: string; email: string | null };
  fulfillmentStatus: string;
  fulfillmentLabel: string;
  paymentStatus: string;
  paymentLabel: string;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  shippingMethod: string;
  deliveryFeeMode: string;
  gatewayRefId: string | null;
  shippingTracking: string | null;
  adminNote: string | null;
  items: {
    productName: string;
    colorName: string | null;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }[];
  events: {
    dimension: string;
    from: string;
    to: string;
    actor: string;
    note: string | null;
    at: string;
  }[];
  /** Resolved by the gateway from the table `POST /orders/:id/status` enforces. Rendered, not decided. */
  transitions: OrderTransitions;
  reservations: { id: string; qty: number; status: string }[];
  shippingAddress: {
    province: string | null;
    city: string | null;
    addressLine: string | null;
    recipientName: string | null;
    recipientPhone: string | null;
    postalCode: string | null;
  };
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let order: OrderAdminDetail;
  try {
    order = await readThrough<OrderAdminDetail>(`/orders/${encodeURIComponent(id)}`);
  } catch (error) {
    // A 404 is this page's answer and anything else is a fault, so the two are told apart rather than
    // collapsed: a gateway that is down must not look like an order that does not exist.
    if (isNotFound(error)) notFound();
    throw error;
  }
  const { shippingAddress: address } = order;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/orders" className="text-sm text-ash hover:underline">سفارش‌ها</Link>
        <h1 className="text-xl font-bold text-ink">سفارش {order.orderNumber}</h1>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* The steps the form may offer, as the gateway resolved them for this order's two states. */}
          <Card>
            <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-ink">وضعیت و انتقال</h2>
                <p className="mt-0.5 text-sm text-ash">{`اجرا: ${order.fulfillmentLabel} • پرداخت: ${order.paymentLabel}`}</p>
              </div>
            </CardHeader>
            <CardContent>
              <OrderStatusTransitions
                orderId={order.id}
                fulfilled={order.fulfillmentStatus}
                paid={order.paymentStatus}
                allowed={order.transitions}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-ink">اقلام سفارش</h2>
                <p className="mt-0.5 text-sm text-ash">{`${toFaDigits(order.items.length)} قلم`}</p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div role="region" aria-label="جدول داده‌ها" tabIndex={0} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flame-300">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>محصول</TableHead>
                      <TableHead>تنوع</TableHead>
                      <TableHead>قیمت واحد</TableHead>
                      <TableHead>تعداد</TableHead>
                      <TableHead>جمع</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.items.map((it, i) => (
                      <TableRow key={`${order.id}-${i}`}>
                        <TableCell>{it.productName}</TableCell>
                        <TableCell>{it.colorName || "—"}</TableCell>
                        <TableCell>{formatToman(it.unitPrice)}</TableCell>
                        <TableCell>{toFaDigits(it.quantity)}</TableCell>
                        <TableCell>{formatToman(it.lineTotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-1 border-t border-plaster px-5 py-4 text-sm">
                <div className="flex justify-between"><span>جمع کالا</span><span>{formatToman(order.subtotal)}</span></div>
                <div className="flex justify-between"><span>تخفیف</span><span className="text-red-700">−{formatToman(order.discountAmount)}</span></div>
                <div className="flex justify-between"><span>ارسال</span><span>{formatToman(order.deliveryFee)}</span></div>
                <div className="flex justify-between border-t border-plaster pt-2 text-base font-bold"><span>قابل پرداخت</span><span>{formatToman(order.total)}</span></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-ink">رویدادها</h2>
                <p className="mt-0.5 text-sm text-ash">تاریخچهٔ وضعیت سفارش</p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {order.events.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ash">رویدادی ثبت نشده است</p>
              ) : (
                <ul className="divide-y divide-plaster">
                  {order.events.map((ev, i) => (
                    <li key={`${order.id}-${ev.at}-${i}`} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
                      <div>
                        <span className="ml-2 rounded bg-plaster px-2 py-0.5 text-xs font-medium">{ev.dimension === "FULFILLMENT" ? "اجرا" : "پرداخت"}</span>
                        <span dir="ltr" className="text-ink">{ev.from === "" ? "—" : ev.from} → {ev.to}</span>
                        {ev.note && <p className="mt-1 text-xs text-ash">{ev.note}</p>}
                      </div>
                      <div className="text-left text-xs text-ash">
                        <div>{ev.actor}</div>
                        <div>{formatJalaliDateTime(new Date(ev.at))}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
              <h2 className="text-base font-semibold text-ink">مشتری</h2>
              <div className="shrink-0"><Link href={`/customers/${order.customerId}`} className="text-xs text-ink hover:text-flame-700">مشاهده</Link></div>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="font-medium text-ink">{order.customer.name || order.customer.phone}</div>
              <div dir="ltr" className="text-ash text-left">{order.customer.phone}</div>
              {order.customer.email && <div dir="ltr" className="text-left text-ash">{order.customer.email}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
              <h2 className="text-base font-semibold text-ink">پرداخت</h2>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="روش" value={order.paymentMethod} />
              <Row label="وضعیت پرداخت" value={<StatusBadge status={order.paymentStatus} />} />
              <Row label="روش ارسال" value={order.shippingMethod} />
              <Row label="نحوه ارسال" value={order.deliveryFeeMode} />
              {order.gatewayRefId && <Row label="کد رهگیری درگاه" value={order.gatewayRefId} />}
              {order.shippingTracking && <Row label="رهگیری" value={order.shippingTracking} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
              <h2 className="text-base font-semibold text-ink">آدرس گیرنده</h2>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {address.province && address.city && (
                <p>{address.province} — {address.city}</p>
              )}
              {address.addressLine && <p>{address.addressLine}</p>}
              {address.recipientName && <p>{address.recipientName}</p>}
              {address.recipientPhone && <p dir="ltr" className="text-left text-ash">{address.recipientPhone}</p>}
              {address.postalCode && <p dir="ltr" className="text-left text-ash">{address.postalCode}</p>}
              {!address.addressLine && <p className="text-ash">آدرسی ثبت نشده</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
              <h2 className="text-base font-semibold text-ink">رزروها</h2>
            </CardHeader>
            <CardContent>
              {order.reservations.length === 0 ? (
                <p className="text-sm text-ash">رزروی ثبت نشده</p>
              ) : (
                <ul className="space-y-1 text-sm">{order.reservations.map((r) => (
                  <li key={r.id} className="flex justify-between"><span>تعداد {toFaDigits(r.qty)}</span><Badge className={r.status === "COMMITTED" ? "bg-emerald-100 text-emerald-900" : r.status === "ACTIVE" ? "bg-flame-100 text-flame-800" : "bg-plaster text-ink"}>{r.status}</Badge></li>
                ))}</ul>
              )}
            </CardContent>
          </Card>

          {order.adminNote && (
            <Card>
              <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
                <h2 className="text-base font-semibold text-ink">یادداشت ادمین</h2>
              </CardHeader>
              <CardContent><p className="text-sm text-ink">{order.adminNote}</p></CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/** Is this the gateway saying the order is not there? */
function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.message.includes("پیدا نشد");
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ash">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

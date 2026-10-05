import { toFaDigits,formatJalaliDateTime } from "@kmodern/contracts";
// One customer, read through the gateway.
//
// The page used to run three queries of its own: the customer with their addresses and their newest
// orders, and an aggregate over every order they had placed. The aggregate was the reason this is
// one read rather than two: a customer with sixty orders was shown the newest fifty and, in the
// header, the sum of all sixty — a page computing one number from a query and another from a slice
// of it, which is how "مجموع خرید" and the order table came to disagree.
//
// An id that names nobody is now the gateway's 404, and it reaches the error boundary rather than
// rendering this page with an empty customer. The old `notFound()` drew the same screen as a
// customer with no orders and no addresses, on the screen where an operator decides whether to chase
// an order — two very different facts, one picture.

import Link from "next/link";
import { readThrough } from "@/lib/reads";
import { Badge, Card, CardContent, CardHeader, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@kmodern/ui";
import { EmptyState } from "@/components/panel-ui";
import { StatusBadge } from "@/components/status";
import { formatToman } from "@kmodern/contracts/format";

/** One customer, as `GET /customers/:id` answers. Dates are ISO; money and counts are numbers. */
interface CustomerDetail {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  smsMarketingConsent: boolean;
  joinedAt: string;
  /** Over *every* order the customer has placed, not over the slice listed below. */
  orderCount: number;
  totalSpend: number;
  addresses: {
    id: string;
    recipientName: string;
    recipientPhone: string;
    province: string;
    city: string;
    addressLine: string;
    postalCode: string;
    isDefault: boolean;
  }[];
  /** The newest slice; the count above is the whole number. */
  recentOrders: {
    id: string;
    orderNumber: string;
    placedAt: string;
    fulfillmentStatus: string;
    paymentStatus: string;
    total: number;
  }[];
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await readThrough<CustomerDetail>(`/customers/${encodeURIComponent(id)}`);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/customers" className="text-sm text-ash hover:underline">مشتریان</Link>
        <h1 className="text-xl font-bold text-ink">{customer.name || customer.phone}</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
            <h2 className="text-base font-semibold text-ink">مشخصات</h2>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ash">تلفن</dt><dd dir="ltr">{customer.phone}</dd></div>
              <div className="flex justify-between"><dt className="text-ash">ایمیل</dt><dd>{customer.email || toFaDigits("—")}</dd></div>
              <div className="flex justify-between"><dt className="text-ash">عضویت</dt><dd>{formatJalaliDateTime(new Date(customer.joinedAt))}</dd></div>
              <div className="flex justify-between"><dt className="text-ash">بازاریابی پیامکی</dt><dd>{customer.smsMarketingConsent ? "فعال" : "غیرفعال"}</dd></div>
              <div className="flex justify-between"><dt className="text-ash">مجموع خرید</dt><dd className="font-semibold">{formatToman(customer.totalSpend)}</dd></div>
            </dl>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink">آدرس‌ها</h2>
              <p className="mt-0.5 text-sm text-ash">{`${toFaDigits(customer.addresses.length)} آدرس`}</p>
            </div>
          </CardHeader>
          <CardContent>
            {customer.addresses.length === 0 ? (
              <EmptyState text="آدرسی ثبت نشده است" />
            ) : (
              <div className="space-y-2">
                {customer.addresses.map((a) => (
                  <div key={a.id} className="rounded-card border border-plaster p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{a.recipientName}</span>
                      <span dir="ltr" className="text-xs text-ash">{a.recipientPhone}</span>
                      {a.isDefault && <Badge className="bg-flame-100 text-flame-800">پیش‌فرض</Badge>}
                    </div>
                    <p className="mt-1 text-ink">{a.province}، {a.city} — {a.addressLine}</p>
                    <p dir="ltr" className="mt-0.5 text-xs text-ash">کد پستی: {a.postalCode}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">سفارش‌ها</h2>
            <p className="mt-0.5 text-sm text-ash">{`${toFaDigits(customer.orderCount)} سفارش${customer.recentOrders.length < customer.orderCount ? ` (نمایش ${toFaDigits(customer.recentOrders.length)} سفارش آخر)` : ""}`}</p>
          </div>
        </CardHeader>
        {customer.recentOrders.length === 0 ? (
          <EmptyState text="سفارشی ثبت نشده است" />
        ) : (
          <div role="region" aria-label="جدول داده‌ها" tabIndex={0} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flame-300">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>شماره</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead>وضعیت ارسال</TableHead>
                  <TableHead>وضعیت پرداخت</TableHead>
                  <TableHead>مبلغ</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.recentOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell dir="ltr" className="font-medium">{o.orderNumber}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{formatJalaliDateTime(new Date(o.placedAt))}</TableCell>
                    <TableCell><StatusBadge status={o.fulfillmentStatus} /></TableCell>
                    <TableCell><StatusBadge status={o.paymentStatus} /></TableCell>
                    <TableCell className="font-medium">{formatToman(o.total)}</TableCell>
                    <TableCell><Link href={`/orders/${o.id}`} className="text-xs text-ash hover:underline">مشاهده</Link></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

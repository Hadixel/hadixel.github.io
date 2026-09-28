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
import { faDigits, formatJalaliDateTime } from "@/lib/date";
import { Badge, Card, CardBody, CardHeader, EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { formatToman } from "@kmodern/schema/format";

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
          <CardHeader title="مشخصات" />
          <CardBody>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ash">تلفن</dt><dd dir="ltr">{customer.phone}</dd></div>
              <div className="flex justify-between"><dt className="text-ash">ایمیل</dt><dd>{customer.email || faDigits("—")}</dd></div>
              <div className="flex justify-between"><dt className="text-ash">عضویت</dt><dd>{formatJalaliDateTime(new Date(customer.joinedAt))}</dd></div>
              <div className="flex justify-between"><dt className="text-ash">بازاریابی پیامکی</dt><dd>{customer.smsMarketingConsent ? "فعال" : "غیرفعال"}</dd></div>
              <div className="flex justify-between"><dt className="text-ash">مجموع خرید</dt><dd className="font-semibold">{formatToman(customer.totalSpend)}</dd></div>
            </dl>
          </CardBody>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader title="آدرس‌ها" subtitle={`${faDigits(customer.addresses.length)} آدرس`} />
          <CardBody>
            {customer.addresses.length === 0 ? (
              <EmptyState text="آدرسی ثبت نشده است" />
            ) : (
              <div className="space-y-2">
                {customer.addresses.map((a) => (
                  <div key={a.id} className="rounded-card border border-plaster p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{a.recipientName}</span>
                      <span dir="ltr" className="text-xs text-ash">{a.recipientPhone}</span>
                      {a.isDefault && <Badge color="sky">پیش‌فرض</Badge>}
                    </div>
                    <p className="mt-1 text-ink">{a.province}، {a.city} — {a.addressLine}</p>
                    <p dir="ltr" className="mt-0.5 text-xs text-ash">کد پستی: {a.postalCode}</p>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="سفارش‌ها"
          subtitle={`${faDigits(customer.orderCount)} سفارش${customer.recentOrders.length < customer.orderCount ? ` (نمایش ${faDigits(customer.recentOrders.length)} سفارش آخر)` : ""}`}
        />
        {customer.recentOrders.length === 0 ? (
          <EmptyState text="سفارشی ثبت نشده است" />
        ) : (
          <Table>
          <THead>
            <TR>
              <TH>شماره</TH>
              <TH>تاریخ</TH>
              <TH>وضعیت ارسال</TH>
              <TH>وضعیت پرداخت</TH>
              <TH>مبلغ</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {customer.recentOrders.map((o) => (
              <TR key={o.id}>
                <TD dir="ltr" className="font-medium">{o.orderNumber}</TD>
                <TD className="whitespace-nowrap text-xs">{formatJalaliDateTime(new Date(o.placedAt))}</TD>
                <TD><StatusBadge status={o.fulfillmentStatus} /></TD>
                <TD><StatusBadge status={o.paymentStatus} /></TD>
                <TD className="font-medium">{formatToman(o.total)}</TD>
                <TD><Link href={`/orders/${o.id}`} className="text-xs text-ash hover:underline">مشاهده</Link></TD>
              </TR>
            ))}
          </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@kmodern/db";
import { faDigits, formatJalaliDateTime } from "@/lib/date";
import { Badge, Card, CardBody, CardHeader, EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { formatToman } from "@kmodern/schema";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await db().customer.findUnique({
    where: { id },
    include: {
      addresses: { orderBy: { isDefault: "desc" } },
      orders: { include: { _count: { select: { items: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!customer) notFound();

  const totals = customer.orders.reduce(
    (acc, o) => ({ count: acc.count + 1, sum: acc.sum + o.total }),
    { count: 0, sum: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/customers" className="text-sm text-slate-500 hover:underline">مشتریان</Link>
        <h1 className="text-xl font-bold text-slate-900">{customer.name || customer.phone}</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader title="مشخصات" />
          <CardBody>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">تلفن</dt><dd dir="ltr">{customer.phone}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">ایمیل</dt><dd>{customer.email || faDigits("—")}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">عضویت</dt><dd>{formatJalaliDateTime(customer.createdAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">بازاریابی پیامکی</dt><dd>{customer.smsMarketingConsent ? "فعال" : "غیرفعال"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">مجموع خرید</dt><dd className="font-semibold">{formatToman(totals.sum)}</dd></div>
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
                  <div key={a.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{a.recipientName}</span>
                      <span dir="ltr" className="text-xs text-slate-400">{a.recipientPhone}</span>
                      {a.isDefault && <Badge color="sky">پیش‌فرض</Badge>}
                    </div>
                    <p className="mt-1 text-slate-600">{a.province}، {a.city} — {a.addressLine}</p>
                    <p dir="ltr" className="mt-0.5 text-xs text-slate-400">کد پستی: {a.postalCode}</p>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="سفارش‌ها" subtitle={`${faDigits(totals.count)} سفارش`} />
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
            {customer.orders.map((o) => (
              <TR key={o.id}>
                <TD dir="ltr" className="font-medium">{o.orderNumber}</TD>
                <TD className="whitespace-nowrap text-xs">{formatJalaliDateTime(o.createdAt)}</TD>
                <TD><StatusBadge status={o.fulfillmentStatus} /></TD>
                <TD><StatusBadge status={o.paymentStatus} /></TD>
                <TD className="font-medium">{formatToman(o.total)}</TD>
                <TD><Link href={`/orders/${o.id}`} className="text-xs text-slate-500 hover:underline">مشاهده</Link></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
import Link from "next/link";
import { db } from "@kmodern/db";
import { faDigits, formatJalaliDateTime } from "@/lib/date";
import { Badge, Card, CardHeader, EmptyState, Input, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = (await searchParams).q?.trim();
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const customers = await db().customer.findMany({
    where,
    include: { _count: { select: { orders: true, addresses: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="مشتریان" subtitle={`${faDigits(customers.length)} مشتری`} />
        <div className="border-b border-plaster px-5 py-3">
          <form action="/customers" method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-ash">جستجو (نام، تلفن، ایمیل)</label>
              <Input name="q" defaultValue={q} className="w-64" />
            </div>
            <button type="submit" className="rounded-card bg-plaster px-4 py-2 text-sm text-ink hover:bg-fog/60">اعمال</button>
          </form>
        </div>
        {customers.length === 0 ? (
          <EmptyState text="مشتری‌ای یافت نشد" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>نام</TH>
                <TH>تلفن</TH>
                <TH>ایمیل</TH>
                <TH>سفارش‌ها</TH>
                <TH>عضویت</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {customers.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/customers/${c.id}`} className="font-medium text-ink hover:text-flame-700">
                      {c.name || faDigits("—")}
                    </Link>
                  </TD>
                  <TD dir="ltr" className="text-right">{c.phone}</TD>
                  <TD>{c.email || faDigits("—")}</TD>
                  <TD>
                    <Badge>{faDigits(c._count.orders)}</Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-xs">{formatJalaliDateTime(c.createdAt)}</TD>
                  <TD>
                    <Link href={`/customers/${c.id}`} className="text-xs text-ash hover:underline">مشاهده</Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
import Link from "next/link";
import { db } from "@kmodern/db";
import { faDigits, formatJalaliDateTime } from "@/lib/date";
import { Badge, Card, CardHeader, EmptyState, Input, Pagination, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

const PAGE_SIZE = 25;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim();
  const parsedPage = Number(params.page);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 100_000) : 1;
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [customers, total] = await Promise.all([
    db().customer.findMany({
      where,
      include: { _count: { select: { orders: true, addresses: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db().customer.count({ where }),
  ]);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="مشتریان" subtitle={`${faDigits(total)} مشتری`} />
        <div className="border-b border-plaster px-5 py-3">
          <form action="/customers" method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-ash">جستجو (نام، تلفن، ایمیل)</label>
              <Input aria-label="جستجوی مشتری" name="q" defaultValue={q} className="w-64" />
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
      <Pagination page={page} totalPages={totalPages} basePath={q ? `/customers?q=${encodeURIComponent(q)}` : "/customers"} />
    </div>
  );
}
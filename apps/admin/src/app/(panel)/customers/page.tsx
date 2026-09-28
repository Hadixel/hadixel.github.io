// The customers list, read through the gateway.
//
// This page used to import the data tier and hold its own query: an OR over name, phone and email,
// a count beside the rows, and a page size. The OR was the part that mattered — a search written
// next to a table is a search nothing else can be held to, and there was no way to ask what it
// matched without creating customers until it did. It is the gateway's now
// (`GET /customers`), together with the count, and this page names what it wants instead.
//
// A failure here throws rather than rendering an empty table, which is the helper's decision and
// the right one: a table of no customers under a header reading "۰ مشتری" is indistinguishable from
// a shop whose customers have all been deleted, and an operator who believed it might act on it.

import Link from "next/link";
import { readThrough } from "@/lib/reads";
import { pageParam } from "@/lib/pagination";
import { faDigits, formatJalaliDateTime } from "@/lib/date";
import { Badge, Card, CardHeader, EmptyState, Input, Pagination, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

/**
 * The rows this table shows.
 *
 * Sent as the page size rather than left to the gateway's default, because the page size is the
 * page's: the table's density is a rendering decision. The gateway answers with the size it actually
 * served, so the pagination below counts pages of that size and not of the number written here.
 */
const PAGE_SIZE = 25;

/** One row of the table, as `GET /customers` answers. */
interface CustomerSummary {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  orderCount: number;
  /** ISO. A `Date` crosses JSON as a string, and the formatter below takes a `Date`. */
  joinedAt: string;
}

/** One page of customers, with the count the header renders. */
interface CustomerListPage {
  rows: CustomerSummary[];
  total: number;
  page: number;
  size: number;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim();
  const page = pageParam(params.page);

  const query = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
  // Only when there is something to search for: an empty `q` is a filter over nothing, and sending
  // one would ask the gateway to answer a question about an empty string rather than to list
  // everyone.
  if (q) query.set("q", q);

  const customers = await readThrough<CustomerListPage>(`/customers?${query.toString()}`);
  const totalPages = Math.ceil(customers.total / customers.size);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="مشتریان" subtitle={`${faDigits(customers.total)} مشتری`} />
        <div className="border-b border-plaster px-5 py-3">
          <form action="/customers" method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-ash">جستجو (نام، تلفن، ایمیل)</label>
              <Input aria-label="جستجوی مشتری" name="q" defaultValue={q} className="w-64" />
            </div>
            <button type="submit" className="rounded-card bg-plaster px-4 py-2 text-sm text-ink hover:bg-fog/60">اعمال</button>
          </form>
        </div>
        {customers.rows.length === 0 ? (
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
              {customers.rows.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/customers/${c.id}`} className="font-medium text-ink hover:text-flame-700">
                      {c.name || faDigits("—")}
                    </Link>
                  </TD>
                  <TD dir="ltr" className="text-right">{c.phone}</TD>
                  <TD>{c.email || faDigits("—")}</TD>
                  <TD>
                    <Badge>{faDigits(c.orderCount)}</Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-xs">{formatJalaliDateTime(new Date(c.joinedAt))}</TD>
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

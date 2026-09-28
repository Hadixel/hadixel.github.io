// The discount list, read through the gateway.
//
// This page used to import the data tier and run three queries of its own: a page of rows, a total
// for the pager, and a count of the active ones for the header. The gateway answers all three in one
// read, and answers them together — a count fetched beside the rows it describes can disagree with
// them, and two round trips for one table is one too many.

import Link from "next/link";
import { formatToman } from "@kmodern/schema/format";
import { faDigits, formatJalaliLong } from "@/lib/date";
import { Badge, Button, Card, CardHeader, EmptyState, Pagination, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { pageParam } from "@/lib/pagination";
import { readThrough } from "@/lib/reads";
import { DeleteDiscountButton } from "./delete-discount";

const TYPE_LABELS: Record<string, string> = { PERCENT: "درصدی", FIXED: "مبلغ ثابت", FREE_DELIVERY: "ارسال رایگان" };
const SCOPE_LABELS: Record<string, string> = {
  ALL: "کل سبد",
  PRODUCTS: "محصولات خاص",
  CATEGORIES: "دسته‌ها",
  COLLECTIONS: "مجموعه‌ها",
};
const MODE_LABELS: Record<string, string> = { COUPON: "کوپن", AUTOMATIC: "خودکار" };

/** One page of discounts, as the gateway's `GET /discounts` answers. */
interface DiscountPage {
  rows: {
    id: string;
    code: string | null;
    type: string;
    scope: string;
    mode: string;
    value: number;
    status: string;
    startsAt: string;
    endsAt: string | null;
  }[];
  total: number;
  active: number;
  size: number;
}

export default async function DiscountsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const page = pageParam(params.page);
  const { rows, total, active } = await readThrough<DiscountPage>(`/discounts?page=${page}`);
  const totalPages = Math.ceil(total / 25);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="تخفیف‌ها"
          subtitle={`${faDigits(active)} تخفیف فعال`}
          actions={
            <Button asChild>
              <Link href="/discounts/new">تخفیف جدید</Link>
            </Button>
          }
        />
        {rows.length === 0 ? (
          <EmptyState text="تخفیفی ثبت نشده است" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>عنوان/کد</TH>
                <TH>نوع</TH>
                <TH>دامنه</TH>
                <TH>مقدار</TH>
                <TH>بازه</TH>
                <TH>وضعیت</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <Link href={`/discounts/${d.id}`} className="font-medium text-ink hover:text-flame-700">
                      {d.mode === "COUPON" ? d.code : d.id.slice(0, 8)}
                    </Link>
                    <div className="text-xs text-ash">{MODE_LABELS[d.mode]}</div>
                  </TD>
                  <TD>{TYPE_LABELS[d.type] ?? d.type}</TD>
                  <TD>{SCOPE_LABELS[d.scope] ?? d.scope}</TD>
                  <TD>
                    {d.type === "PERCENT" ? `${faDigits(d.value)}٪` : d.type === "FREE_DELIVERY" ? "رایگان" : formatToman(d.value)}
                  </TD>
                  <TD className="whitespace-nowrap text-xs">
                    {formatJalaliLong(new Date(d.startsAt))}
                    {d.endsAt ? ` تا ${formatJalaliLong(new Date(d.endsAt))}` : ""}
                  </TD>
                  <TD>
                    <Badge color={d.status === "ACTIVE" ? "emerald" : "slate"}>
                      {d.status === "ACTIVE" ? "فعال" : "غیرفعال"}
                    </Badge>
                  </TD>
                  <TD>
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/discounts/${d.id}`}>ویرایش</Link>
                      </Button>
                      <DeleteDiscountButton id={d.id} />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Pagination page={page} totalPages={totalPages} basePath="/discounts" />
    </div>
  );
}

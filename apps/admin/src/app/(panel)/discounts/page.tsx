import { toFaDigits,formatJalaliLong } from "@kmodern/contracts";
// The discount list, read through the gateway.
//
// This page used to import the data tier and run three queries of its own: a page of rows, a total
// for the pager, and a count of the active ones for the header. The gateway answers all three in one
// read, and answers them together — a count fetched beside the rows it describes can disagree with
// them, and two round trips for one table is one too many.

import Link from "next/link";
import { formatToman } from "@kmodern/contracts/format";
import { Badge, Button, Card, CardHeader, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@kmodern/ui";
import { EmptyState, Pagination } from "@/components/panel-ui";
import { pageParam } from "@/lib/pagination";
import { readThrough } from "@/lib/reads";
import { DeleteDiscountButton } from "@/discounts/components/delete-discount";

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
        <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">تخفیف‌ها</h2>
            <p className="mt-0.5 text-sm text-ash">{`${toFaDigits(active)} تخفیف فعال`}</p>
          </div>
          <div className="shrink-0">
            <Button asChild>
              <Link href="/discounts/new">تخفیف جدید</Link>
            </Button>
          </div>
        </CardHeader>
        {rows.length === 0 ? (
          <EmptyState text="تخفیفی ثبت نشده است" />
        ) : (
          <div role="region" aria-label="جدول داده‌ها" tabIndex={0} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flame-300">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>عنوان/کد</TableHead>
                  <TableHead>نوع</TableHead>
                  <TableHead>دامنه</TableHead>
                  <TableHead>مقدار</TableHead>
                  <TableHead>بازه</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Link href={`/discounts/${d.id}`} className="font-medium text-ink hover:text-flame-700">
                        {d.mode === "COUPON" ? d.code : d.id.slice(0, 8)}
                      </Link>
                      <div className="text-xs text-ash">{MODE_LABELS[d.mode]}</div>
                    </TableCell>
                    <TableCell>{TYPE_LABELS[d.type] ?? d.type}</TableCell>
                    <TableCell>{SCOPE_LABELS[d.scope] ?? d.scope}</TableCell>
                    <TableCell>
                      {d.type === "PERCENT" ? `${toFaDigits(d.value)}٪` : d.type === "FREE_DELIVERY" ? "رایگان" : formatToman(d.value)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatJalaliLong(new Date(d.startsAt))}
                      {d.endsAt ? ` تا ${formatJalaliLong(new Date(d.endsAt))}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge className={d.status === "ACTIVE" ? "bg-emerald-100 text-emerald-900" : "bg-plaster text-ink"}>
                        {d.status === "ACTIVE" ? "فعال" : "غیرفعال"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/discounts/${d.id}`}>ویرایش</Link>
                        </Button>
                        <DeleteDiscountButton id={d.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
      <Pagination page={page} totalPages={totalPages} basePath="/discounts" />
    </div>
  );
}

import { toFaDigits } from "@kmodern/contracts";
// The pages list, read through the gateway.
//
// This page used to import the data tier and hold its own query: a `where` assembled beside a table,
// an unbounded `findMany`, and — for the "بلوک" column — a read of every page's entire `draftBlocks`
// array so the JSX could call `.length` on it. A page of two hundred blocks meant a table cell that
// received two hundred blocks' worth of JSON to render the number ۲۰۰. The read now answers the count,
// named for the column that shows it (`GET /pages`).
//
// The split into system and custom rows is the page's still, because that is a rendering decision —
// which group an operator reads first — and the read orders by kind so the two groups arrive whole.

import Link from "next/link";
import { readThrough } from "@/lib/reads";
import { enumParam, pageParam } from "@/lib/pagination";
import { Badge, Button, Card, CardHeader, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@kmodern/ui";
import { EmptyState, Pagination, Select } from "@/components/panel-ui";
import { StatusBadge } from "@/components/status";
import { DeletePageButton } from "@/content/components/delete-page";

/**
 * The rows this table shows.
 *
 * Sent as the page size rather than left to the gateway's default, because the table's density is a
 * rendering decision. The gateway answers with the size it actually served, so the pager counts pages
 * of that size and not of the number written here.
 */
const PAGE_SIZE = 25;

/** One row, as `GET /pages` answers. `blockCount` is the number, not the blocks behind it. */
interface PageSummary {
  id: string;
  title: string;
  slug: string;
  kind: string;
  status: string;
  blockCount: number;
}

/** One page of pages, with the count the pager divides by. */
interface PageListPage {
  rows: PageSummary[];
  total: number;
  page: number;
  size: number;
}

export default async function PagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const status = enumParam(params.status, ["DRAFT", "PUBLISHED", "ARCHIVED"]);
  const q = params.q?.trim();
  const page = pageParam(params.page);

  // Built as one query string so the same values drive the request and the pager's links: a filter the
  // request applied and the links dropped is a filter an operator cannot get back to.
  const query = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
    size: String(PAGE_SIZE),
  });
  // The filters on their own — no page — because the form must submit a fresh search onto page one.
  const baseQs = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
  });

  const pages = await readThrough<PageListPage>(`/pages?${query.toString()}`);
  // The size the server actually read, not the one that was asked for: the gateway clamps it, and a
  // pager dividing by a size it did not get is a pager whose page count disagrees with its rows.
  const totalPages = Math.ceil(pages.total / pages.size);

  const systemPages = pages.rows.filter((p) => p.kind === "SYSTEM");
  const customPages = pages.rows.filter((p) => p.kind === "CUSTOM");

  const Row = ({ p, pinned }: { p: PageSummary; pinned?: boolean }) => (
    <TableRow key={p.id}>
      <TableCell>
        <Link href={`/pages/${p.id}`} className="font-medium text-ink hover:text-flame-700">{p.title}</Link>
        <div className="text-xs text-ash"><span dir="ltr">{p.slug}</span></div>
      </TableCell>
      <TableCell>{pinned ? <Badge className="bg-plaster text-ink">سیستمی</Badge> : <Badge>سفارشی</Badge>}</TableCell>
      <TableCell><StatusBadge status={p.status} /></TableCell>
      <TableCell>{toFaDigits(p.blockCount)} بلوک</TableCell>
      <TableCell>{p.kind === "CUSTOM" && p.status === "DRAFT" && <DeletePageButton id={p.id} />}</TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">صفحات</h2>
            <p className="mt-0.5 text-sm text-ash">{pages.total ? `${toFaDigits(pages.total)} صفحه` : "صفحات سیستمی همیشه بالا و غیرقابل حذف"}</p>
          </div>
          <div className="shrink-0">
            <Button asChild>
              <Link href="/pages/new">صفحه جدید</Link>
            </Button>
          </div>
        </CardHeader>
        <div className="border-b border-plaster px-5 py-3">
          <form action="/pages" method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-ash">جستجو</label>
              <Input aria-label="جستجوی صفحات" name="q" defaultValue={q} className="w-56" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ash">وضعیت</label>
              <Select aria-label="فیلتر وضعیت صفحه" name="status" defaultValue={status ?? "ALL"}>
                <option value="ALL">همه</option>
                <option value="DRAFT">پیش‌نویس</option>
                <option value="PUBLISHED">منتشر شده</option>
              </Select>
            </div>
            <Button type="submit" variant="outline">اعمال</Button>
          </form>
        </div>

        {pages.rows.length === 0 ? (
          <EmptyState text="صفحه‌ای یافت نشد" />
        ) : (
          <div role="region" aria-label="جدول داده‌ها" tabIndex={0} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flame-300">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>عنوان</TableHead>
                  <TableHead>نوع</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>بلوک‌ها</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {systemPages.map((p) => Row({ p, pinned: true }))}
                {customPages.map((p) => Row({ p }))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
      <Pagination page={page} totalPages={totalPages} basePath={`/pages${baseQs.size > 0 ? `?${baseQs.toString()}` : ""}`} />
    </div>
  );
}

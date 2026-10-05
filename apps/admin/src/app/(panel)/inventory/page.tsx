import { toFaDigits } from "@kmodern/contracts";
// The stock list, read through the gateway.
//
// This page used to read the shop's low-stock line out of the settings table itself — with a `3`
// written beside the read as the fallback — and then compared every row's stock against the number
// it had just fetched. Two facts in two files: the configured line, and the number the page acted
// on. Changing the setting moved the settings form and left this page deciding "کم" against its own
// copy, so the shop's configured threshold and the threshold the shop acted on could drift apart
// with neither able to see it.
//
// Both are one read now (`GET /stock-levels`): the line, the count of variants at or below it, and
// each row's own verdict. This page holds no threshold, and does not compare — which is the point,
// because a page that decides which of its rows are low holds a second copy of the rule.

import Link from "next/link";
import { readThrough } from "@/lib/reads";
import { pageParam } from "@/lib/pagination";
import { Badge, Card, CardHeader, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@kmodern/ui";
import { EmptyState, Pagination } from "@/components/panel-ui";
import { AdjustStockRow } from "@/inventory/components/adjust-form";

/**
 * The rows this table shows.
 *
 * Sent as the page size rather than left to the gateway's default, because the page size is the
 * page's. The gateway answers with the size it served, so the pagination below counts pages of that
 * size rather than of the number written here.
 */
const PAGE_SIZE = 50;

/** One page of stock, as `GET /stock-levels` answers. */
interface StockLevelPage {
  /** The shop's configured low-stock line, resolved by the gateway and nowhere else. */
  threshold: number;
  /** How many variants in the shop are at or below it. Not narrowed by the search. */
  lowStockCount: number;
  rows: {
    id: string;
    productId: string;
    productName: string;
    colorName: string;
    sku: string;
    stock: number;
    reserved: number;
    /** On the shelf less what an unpaid order is holding: what a shopper can still buy. */
    available: number;
    /** Whether this row is at or below the line above, decided by the same number. */
    isLow: boolean;
  }[];
  total: number;
  page: number;
  size: number;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = pageParam(params.page);
  const q = params.q?.trim();

  const query = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
  if (q) query.set("q", q);

  const stock = await readThrough<StockLevelPage>(`/stock-levels?${query.toString()}`);
  const totalPages = Math.ceil(stock.total / stock.size);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">موجودی</h2>
            <p className="mt-0.5 text-sm text-ash">{`${toFaDigits(stock.lowStockCount)} تنوع کم‌موجودی (آستانه: ${toFaDigits(stock.threshold)})`}</p>
          </div>
        </CardHeader>
        <div className="border-b border-plaster px-5 py-3">
          <form action="/inventory" method="get" className="flex items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-ash">جستجو (SKU یا نام محصول)</label>
              <Input aria-label="جستجوی SKU یا نام محصول" name="q" defaultValue={q} className="w-64" />
            </div>
            <button type="submit" className="rounded-card border border-fog px-4 py-2 text-sm hover:bg-plaster">جستجو</button>
          </form>
        </div>

        {stock.rows.length === 0 ? (
          <EmptyState text="تنوعی یافت نشد" />
        ) : (
          <>
            <div role="region" aria-label="جدول داده‌ها" tabIndex={0} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flame-300">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>محصول</TableHead>
                    <TableHead>تنوع</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>موجودی</TableHead>
                    <TableHead>رزرو</TableHead>
                    <TableHead>قابل فروش</TableHead>
                    <TableHead>تعدیل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stock.rows.map((v) => (
                    <TableRow key={v.id} className={v.isLow ? "/60" : undefined}>
                      <TableCell>
                        <Link href={`/products/${v.productId}`} className="text-ink hover:text-flame-700">{v.productName}</Link>
                      </TableCell>
                      <TableCell>{v.colorName || "—"}{v.isLow && <Badge className="mr-2 bg-flame-100 text-flame-800">کم</Badge>}</TableCell>
                      <TableCell className="text-xs"><span dir="ltr">{v.sku}</span></TableCell>
                      <TableCell><Badge className={v.stock <= 0 ? "bg-red-100 text-red-800" : v.isLow ? "bg-flame-100 text-flame-800" : "bg-emerald-100 text-emerald-900"}>{toFaDigits(v.stock)}</Badge></TableCell>
                      <TableCell>{toFaDigits(v.reserved)}</TableCell>
                      <TableCell>{toFaDigits(v.available)}</TableCell>
                      <TableCell><AdjustStockRow variantId={v.id} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>
      <Pagination page={page} totalPages={totalPages} basePath={`/inventory${q ? `?q=${encodeURIComponent(q)}` : ""}`} />

    </div>
  );
}

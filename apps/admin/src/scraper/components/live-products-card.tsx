"use client";

import { formatToman, toFaDigits } from "@kmodern/contracts";
import { Card, CardContent, CardHeader, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@kmodern/ui";
import { LiveSourceLink, LiveThumbnail } from "@/scraper/components/product-media";
import type { LiveProductRow } from "@/scraper/lib/scraper-types";

/**
 * Products as the run reads them, one row per page already parsed. The parent mounts this only
 * while a job is active — a finished run's products are the review table's business, not a
 * progress view's.
 */
export function LiveProductsCard({ live }: { live: LiveProductRow[] }) {
  return (
    <Card>
      <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">محصولات در حال خواندن</h3>
          <p className="mt-0.5 text-sm text-ash">هر محصول پس از خوانده‌شدن همین‌جا ظاهر می‌شود؛ فهرست نهایی پس از پالایش، پایین همین صفحه ساخته می‌شود.</p>
        </div>
        <div className="shrink-0"><span className="text-xs text-ash">{toFaDigits(live.length)} محصول</span></div>
      </CardHeader>
      <CardContent>
        {live.length ? (
          <div className="overflow-hidden rounded-card border border-plaster">
            <div role="region" aria-label="جدول داده‌ها" tabIndex={0} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flame-300">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">تصویر</TableHead>
                    <TableHead>محصول</TableHead>
                    <TableHead>سازنده</TableHead>
                    <TableHead className="w-24">رنگ</TableHead>
                    <TableHead className="w-32">قیمت</TableHead>
                    <TableHead className="w-32">صفحه منبع</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {live.map((row) => (
                    <TableRow key={`${row.sourceId}-${row.index}`}>
                      <TableCell><LiveThumbnail row={row} /></TableCell>
                      <TableCell>
                        <div className="font-medium text-ink">{row.name}</div>
                        <div className="mt-1 text-xs text-ash" dir="ltr">{row.sourceId}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-ash">{row.brand || "نامشخص"}</TableCell>
                      <TableCell className="tabular-nums text-xs text-ash">{toFaDigits(row.colors.length)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {row.price && row.price > 0 ? formatToman(row.price) : <span className="text-amber-700">نیازمند قیمت</span>}
                      </TableCell>
                      <TableCell><LiveSourceLink row={row} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-ash">هنوز محصولی خوانده نشده است؛ به‌محض خواندن نخستین صفحه، ردیف‌ها اینجا ظاهر می‌شوند.</p>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { toFaDigits } from "@kmodern/contracts";
import { Button, Card, CardContent, CardHeader } from "@kmodern/ui";
import { Spinner } from "@/components/panel-ui";
import { Metric } from "@/scraper/components/metric";
import type { DateesPriceFetchReport } from "@/scraper/lib/scraper-types";

/**
 * The second step: a price for the products the operator ticked.
 *
 * A scrape carries no price — the manufacturer's pages have none — so this is the only place a
 * fetched price enters the review output. It acts on the selection and nothing else: a product
 * left unticked stays price-less, because "which of these do I trust a fetched price for" is the
 * decision this step exists to ask. The import button remains the only thing that publishes.
 */
export function PriceFetchCard({
  selectedCount,
  busy,
  report,
  notice,
  onFetch,
}: {
  selectedCount: number;
  busy: boolean;
  report: DateesPriceFetchReport | null;
  notice: string | null;
  onFetch: () => void;
}) {
  return (
    <Card>
      <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">دریافت قیمت از داتیس‌شاپ</h3>
          <p className="mt-0.5 text-sm text-ash">قیمت همه محصولات یک‌جا گرفته نمی‌شود: ابتدا در فهرست پایین تیک بزنید، سپس قیمت همان محصولات را از API رسمی داتیس‌شاپ بگیرید.</p>
        </div>
        <div className="shrink-0"><span className="text-xs text-ash">{toFaDigits(selectedCount)} انتخاب‌شده</span></div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onFetch} disabled={!selectedCount || busy}>
            {busy ? <Spinner /> : null}
            دریافت قیمت برای انتخاب‌شده‌ها
          </Button>
          <p className="text-xs leading-5 text-ash">اجرای اسکرپ قیمتی ندارد؛ قیمت‌گذاری اینجا و پس از بررسی انجام می‌شود.</p>
        </div>
        {notice ? (
          <p role="status" aria-live="polite" className="mt-3 rounded-card bg-plaster px-3 py-2 text-sm leading-6 text-ink">{notice}</p>
        ) : null}
        {report ? (
          <div className="mt-4 rounded-card border border-plaster p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-ink">نتیجه دریافت قیمت</h4>
              <span className="text-xs text-ash" dir="ltr">{report.sourceId}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <Metric label="قیمت گرفته شد" value={report.matched} />
              <Metric label="بدون قیمت" value={report.unmatched} danger={report.unmatched > 0} />
              <Metric label="خارج از فهرست" value={report.skipped} danger={report.skipped > 0} />
            </dl>
            {report.error ? <p role="alert" className="mt-3 text-xs leading-5 text-red-700">{report.error}</p> : null}
            <p className="mt-3 text-xs leading-5 text-ash">دریافت قیمت فقط روی خروجی بررسی اثر دارد؛ برای انتشار، محصولات را مثل همیشه انتخاب و وارد کنید.</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

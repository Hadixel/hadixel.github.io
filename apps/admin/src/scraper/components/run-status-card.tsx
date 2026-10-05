"use client";

import { toFaDigits } from "@kmodern/contracts";
import { Button, Card, CardContent, CardHeader } from "@kmodern/ui";
import { Spinner } from "@/components/panel-ui";
import { Metric } from "@/scraper/components/metric";
import { JOB_PHASE_LABELS } from "@/scraper/lib/scraper-labels";
import { formatScrapeFilters, formatTime } from "@/scraper/lib/scraper-format";
import type { ScraperNotice } from "@/scraper/hooks/use-scraper-job";
import type { ScraperJobSnapshot } from "@/scraper/lib/scraper-types";

/**
 * The run's own report: phase, progress bar, counters, and the activity log. It has three empty
 * states in a fixed order — still loading, failed with nothing to show, and simply never started —
 * because those three are visually identical to an operator and must stay distinguishable.
 */
export function RunStatusCard({
  job,
  loading,
  notice,
  refresh,
  progress,
  progressCurrent,
  progressTotal,
}: {
  job: ScraperJobSnapshot | null;
  loading: boolean;
  notice: ScraperNotice | null;
  refresh: () => void;
  progress: number;
  progressCurrent: number;
  progressTotal: number;
}) {
  return (
    <Card>
      <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">وضعیت اجرا</h3>
          <p className="mt-0.5 text-sm text-ash">{job ? JOB_PHASE_LABELS[job.phase] : "هنوز اجرایی آغاز نشده است."}</p>
        </div>
        {job?.startedAt ? <div className="shrink-0"><span className="text-xs text-ash">شروع: {formatTime(job.startedAt)}</span></div> : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-ash">
            <Spinner /> در حال دریافت وضعیت…
          </div>
        ) : !job && notice?.kind === "error" ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center" role="alert">
            <p className="text-sm text-red-700">{notice.text}</p>
            <Button type="button" variant="outline" onClick={refresh}>تلاش دوباره</Button>
          </div>
        ) : !job ? (
          <p className="py-10 text-center text-sm text-ash">هنوز اجرایی آغاز نشده است.</p>
        ) : (
          <div className="space-y-5">
            {formatScrapeFilters(job.filters) ? (
              <p className="rounded-card bg-plaster px-3 py-2 text-xs leading-5 text-ash">فیلترهای اجرا: {formatScrapeFilters(job.filters)}</p>
            ) : null}
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-ink">پیشرفت</span>
                <span className="tabular-nums text-ash">
                  {progressTotal ? `${toFaDigits(progressCurrent)} / ${toFaDigits(progressTotal)}` : "—"}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-pill bg-plaster" role="progressbar" aria-label="پیشرفت اجرای اسکرپ" aria-valuetext={progressTotal ? `${toFaDigits(progressCurrent)} از ${toFaDigits(progressTotal)}` : "در حال آماده‌سازی"} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-pill bg-flame-700 transition-[width] duration-200" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-3 xl:grid-cols-6">
              <Metric label="رکورد خام" value={job.records ?? 0} />
              <Metric label="محصول نهایی" value={job.kept ?? 0} />
              <Metric label="ادغام‌شده" value={job.merged ?? 0} />
              <Metric label="خطای صفحه" value={job.errors ?? 0} danger={(job.errors ?? 0) > 0} />
              <Metric label="فیلترشده" value={job.filteredOut ?? 0} />
              <Metric label="قیمت داتیس‌شاپ" value={job.priceMatched ?? 0} />
               <Metric label="قیمت پیدا نشد" value={job.priceUnmatched ?? 0} danger={(job.priceUnmatched ?? 0) > 0} />
               <Metric label="تصویر دریافتی" value={job.imagesDownloaded ?? 0} />
              <Metric label="خطای تصویر" value={job.imageErrors ?? 0} danger={(job.imageErrors ?? 0) > 0} />
            </dl>

            {job.error ? (
              <p role="alert" className="notice-error-strong">{job.error}</p>
            ) : null}
            {job.priceError ? (
              <p className="mt-2 notice-warning">دریافت قیمت داتیس شاپ کامل نشد: {job.priceError}</p>
            ) : null}

            <div>
              <h4 className="mb-2 text-sm font-semibold text-ink">رویدادها</h4>
              {job.activity.length ? (
                <ul className="max-h-44 space-y-2 overflow-y-auto text-xs leading-5 text-ash" aria-live="polite">
                  {job.activity.map((item, index) => (
                    <li key={`${item}-${index}`} className="border-b border-plaster pb-2 last:border-0">{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ash">پس از شروع اجرا، رویدادها اینجا نمایش داده می‌شوند.</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

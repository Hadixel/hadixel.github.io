"use client";

import { Card, CardContent, CardHeader } from "@kmodern/ui";
import { DownloadLink } from "@/scraper/components/download-link";
import type { ScraperJobSnapshot } from "@/scraper/lib/scraper-types";

/**
 * The run's artefacts, and which of the four the operator actually wants. A scraper writes four
 * files and only one of them is the product; the card exists so that choice does not have to be
 * re-derived from file names every time.
 */
export function OutputFilesCard({ job }: { job: ScraperJobSnapshot | null }) {
  return (
    <Card>
      <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">خروجی و راهنمای فایل‌ها</h3>
          <p className="mt-0.5 text-sm text-ash">هر فایل کار متفاوتی انجام می‌دهد؛ فایل مناسب هر مرحله را از راهنمای زیر انتخاب کنید.</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <DownloadLink filename="catalog.fragment.json" label="کاتالوگ نهایی" description="مناسب ورود به فروشگاه" />
          <DownloadLink filename="raw-scrape.json" label="داده خام سازنده" description="برای بررسی و رفع اشکال" />
          <DownloadLink filename="merge-report.json" label="گزارش ادغام و خطاها" description="برای دیدن تعداد و تعارض‌ها" />
          <DownloadLink filename="price-list-report.json" label="گزارش لیست قیمت" description="تطبیق‌ها و ردیف‌های ردشده" />
        </div>
        <div className="mt-4 rounded-card bg-plaster px-4 py-3 text-sm leading-6">
          <p className="font-semibold text-ink">کدام فایل را استفاده کنم؟</p>
          <p className="mt-1 text-ash"><strong className="text-ink">کاتالوگ نهایی</strong> همان فایلی است که برای بررسی محصولات و ورود انتخاب‌شده به فروشگاه استفاده می‌شود. <strong className="text-ink">داده خام</strong> فقط برای عیب‌یابی scraper است و <strong className="text-ink">گزارش ادغام</strong> می‌گوید چه چیزی حذف، ادغام یا با خطا مواجه شده است. اگر دریافت تصاویر فعال بوده باشد، فایل‌های محلی در <span dir="ltr">out/images</span> نگهداری می‌شوند.</p>
        </div>
        {job?.outputDir ? (
           <div className="mt-4 space-y-1 text-xs leading-5 text-ash">
             <p className="break-all" dir="ltr">{job.outputDir}</p>
             {job.downloadImages ? <p className="break-all" dir="ltr">{job.outputDir}/images/</p> : null}
           </div>
         ) : null}
      </CardContent>
    </Card>
  );
}

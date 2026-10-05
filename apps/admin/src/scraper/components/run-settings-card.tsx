"use client";

import { Button, Card, CardContent, CardHeader, Checkbox, Input } from "@kmodern/ui";
import { Field, Select, Spinner } from "@/components/panel-ui";
import { MultiSelectField } from "@/scraper/components/multi-select-field";
import { ROOT_LABELS, SUB_LABELS, COLOR_LABELS, labelOptions } from "@/scraper/lib/scraper-labels";
import type { ScraperNotice } from "@/scraper/hooks/use-scraper-job";
import type { ContentFilter, PriceFilter, ScrapeSortFilter } from "@/scraper/lib/scraper-catalog";

export interface SourceOption {
  id: string;
  label: string;
}

/**
 * Everything an operator sets before a run: the source, the cap, the scrape filters, the three
 * switches, and the two buttons that start or stop it. Every control here is disabled while a run
 * is in flight — the job's own options cannot change under it.
 */
export function RunSettingsCard({
  sources,
  active,
  busy,
  notice,
  source,
  setSource,
  limit,
  setLimit,
  cache,
  setCache,
  downloadImages,
  setDownloadImages,
  priceLookup,
  setPriceLookup,
  scrapeSearch,
  setScrapeSearch,
  scrapeManufacturer,
  setScrapeManufacturer,
  scrapeWebsite,
  setScrapeWebsite,
  scrapeCategory,
  setScrapeCategory,
  scrapeSubCategory,
  setScrapeSubCategory,
  scrapeColor,
  setScrapeColor,
  scrapePrice,
  setScrapePrice,
  scrapeContent,
  setScrapeContent,
  scrapeSort,
  setScrapeSort,
  manufacturerOptions,
  websiteOptions,
  scrapeSubcategoryOptions,
  clearScrapeFilters,
  copyReviewFiltersToScrape,
  start,
  cancel,
}: {
  sources: SourceOption[];
  active: boolean;
  busy: boolean;
  notice: ScraperNotice | null;
  source: string;
  setSource: (value: string) => void;
  limit: string;
  setLimit: (value: string) => void;
  cache: boolean;
  setCache: (value: boolean) => void;
  downloadImages: boolean;
  setDownloadImages: (value: boolean) => void;
  priceLookup: boolean;
  setPriceLookup: (value: boolean) => void;
  scrapeSearch: string;
  setScrapeSearch: (value: string) => void;
  scrapeManufacturer: string[];
  setScrapeManufacturer: (values: string[]) => void;
  scrapeWebsite: string[];
  setScrapeWebsite: (values: string[]) => void;
  scrapeCategory: string[];
  setScrapeCategory: (values: string[]) => void;
  scrapeSubCategory: string[];
  setScrapeSubCategory: (values: string[]) => void;
  scrapeColor: string[];
  setScrapeColor: (values: string[]) => void;
  scrapePrice: PriceFilter;
  setScrapePrice: (value: PriceFilter) => void;
  scrapeContent: ContentFilter;
  setScrapeContent: (value: ContentFilter) => void;
  scrapeSort: ScrapeSortFilter;
  setScrapeSort: (value: ScrapeSortFilter) => void;
  manufacturerOptions: string[];
  websiteOptions: Array<[string, string]>;
  scrapeSubcategoryOptions: string[];
  clearScrapeFilters: () => void;
  copyReviewFiltersToScrape: () => void;
  start: () => void;
  cancel: () => void;
}) {
  return (
    <Card>
      <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">تنظیمات اجرا</h3>
          <p className="mt-0.5 text-sm text-ash">برای تست سریع، محدودیت محصول را وارد کنید.</p>
        </div>
      </CardHeader>
      <CardContent>
        <Field label="منبع" hint="آداپتورهای فعال از این فهرست انتخاب می‌شوند.">
          <Select value={source} onChange={(event) => setSource(event.target.value)} disabled={active}>
            <option value="all">همه آداپتورها</option>
            {sources.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="حداکثر محصول" hint="خالی بگذارید تا همه محصولات کشف‌شده بررسی شوند.">
          <Input
            type="number"
            min={1}
            max={500}
            inputMode="numeric"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            placeholder="همه محصولات"
            disabled={active}
          />
        </Field>
        <div className="mb-5 rounded-card bg-plaster p-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-ink">فیلترهای اسکرپ</h4>
            <div className="flex items-center gap-2">
              <span className="text-micro text-ash">قبل از شروع اعمال می‌شوند</span>
              <Button type="button" variant="ghost" size="sm" onClick={copyReviewFiltersToScrape} disabled={active}>کپی از فهرست</Button>
              <Button type="button" variant="ghost" size="sm" onClick={clearScrapeFilters} disabled={active}>پاک کردن</Button>
            </div>
          </div>
          <p className="mt-1 text-xs leading-5 text-ash">فیلتر دسته و منبع قبل از خواندن صفحه محصول اعمال می‌شود؛ بقیه فیلترها بعد از استخراج داده اعمال می‌شوند. چند مقدار در یک فیلد OR و ترکیب فیلدهای مختلف AND است.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="جستجو" className="mb-0">
              <Input type="search" value={scrapeSearch} onChange={(event) => setScrapeSearch(event.target.value)} placeholder="نام، مدل یا توضیح…" disabled={active} />
            </Field>
            <Field label="سازنده" className="mb-0" hint="می‌توانید چند سازنده انتخاب کنید.">
              <MultiSelectField label="سازنده" values={scrapeManufacturer} options={manufacturerOptions.map((value) => ({ value, label: value }))} onChange={setScrapeManufacturer} disabled={active} placeholder="همه سازنده‌ها" allowCustom />
            </Field>
            <Field label="وب‌سایت منبع" className="mb-0" hint="می‌توانید چند وب‌سایت انتخاب کنید.">
              <MultiSelectField label="وب‌سایت منبع" values={scrapeWebsite} options={websiteOptions.map(([value, label]) => ({ value, label }))} onChange={setScrapeWebsite} disabled={active} placeholder="همه وب‌سایت‌ها" allowCustom />
            </Field>
            <Field label="دسته اصلی" className="mb-0" hint="انتخاب چند دسته، نتایج را با OR ترکیب می‌کند.">
              <MultiSelectField label="دسته اصلی" values={scrapeCategory} options={labelOptions(ROOT_LABELS)} onChange={(values) => { setScrapeCategory(values); setScrapeSubCategory([]); }} disabled={active} placeholder="همه دسته‌ها" />
            </Field>
            <Field label="زیر‌دسته" className="mb-0" hint="انتخاب چند زیر‌دسته مجاز است.">
              <MultiSelectField label="زیر‌دسته" values={scrapeSubCategory} options={scrapeSubcategoryOptions.map((value) => ({ value, label: SUB_LABELS[value] ?? value }))} onChange={setScrapeSubCategory} disabled={active} placeholder="همه زیر‌دسته‌ها" />
            </Field>
            <Field label="رنگ" className="mb-0" hint="می‌توانید چند رنگ انتخاب کنید.">
              <MultiSelectField label="رنگ" values={scrapeColor} options={labelOptions(COLOR_LABELS)} onChange={setScrapeColor} disabled={active} placeholder="همه رنگ‌ها" />
            </Field>
            <Field label="وضعیت قیمت" className="mb-0">
              <Select value={scrapePrice} onChange={(event) => setScrapePrice(event.target.value as PriceFilter)} disabled={active}>
                <option value="all">همه</option>
                <option value="priced">دارای قیمت</option>
                <option value="missing">نیازمند قیمت</option>
              </Select>
            </Field>
            <Field label="محتوا" className="mb-0">
              <Select value={scrapeContent} onChange={(event) => setScrapeContent(event.target.value as ContentFilter)} disabled={active}>
                <option value="all">همه</option>
                <option value="with-images">دارای تصویر</option>
                <option value="without-images">بدون تصویر</option>
                <option value="with-specs">دارای مشخصات</option>
              </Select>
            </Field>
            <Field label="ترتیب خروجی" className="mb-0">
              <Select value={scrapeSort} onChange={(event) => setScrapeSort(event.target.value as ScrapeSortFilter)} disabled={active}>
                <option value="all">پیش‌فرض</option>
                <option value="newest">جدیدترین</option>
                <option value="name">نام محصول</option>
                <option value="price-high">بیشترین قیمت</option>
                <option value="price-low">کمترین قیمت</option>
              </Select>
            </Field>
          </div>
        </div>
        <div className="mb-5 space-y-3 rounded-card bg-plaster px-3 py-3">
          <div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
              <Checkbox
                checked={cache}
                onCheckedChange={(checked) => setCache(checked === true)}
                disabled={active}
              />
              استفاده از کش HTML
            </label>
            <p className="mt-1 pr-6 text-xs leading-5 text-ash">اجرای بعدی سریع‌تر است و درخواست کمتری به سایت سازنده ارسال می‌کند.</p>
          </div>
          <div className="border-t border-plaster pt-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
              <Checkbox
                checked={downloadImages}
                onCheckedChange={(checked) => setDownloadImages(checked === true)}
                disabled={active}
              />
              دریافت و ذخیره تصاویر محصولات
            </label>
            <p className="mt-1 pr-6 text-xs leading-5 text-ash">تصاویر در پوشه out/images ذخیره می‌شوند و هنگام ورود برای فروشگاه آماده می‌مانند.</p>
          </div>
          <div className="border-t border-plaster pt-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
              <Checkbox
                checked={priceLookup}
                onCheckedChange={(checked) => setPriceLookup(checked === true)}
                disabled={active}
              />
              دریافت قیمت از داتیس شاپ
            </label>
            <p className="mt-1 pr-6 text-xs leading-5 text-ash">قیمت‌های فعلی از API رسمی داتیس شاپ با مدل محصول تطبیق داده می‌شوند.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={start} disabled={active || busy}>
            {busy && !active ? <Spinner /> : null}
            شروع اسکرپ
          </Button>
          {active ? (
            <Button type="button" variant="destructive" onClick={cancel} disabled={busy}>
              لغو اجرا
            </Button>
          ) : null}
        </div>
        {notice ? (
          <p role="alert" className={`mt-4 text-sm ${notice.kind === "error" ? "text-red-700" : "text-flame-800"}`}>
            {notice.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

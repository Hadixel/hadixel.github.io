"use client";

import { Badge } from "@kmodern/ui";
import { useScraperJob } from "@/scraper/hooks/use-scraper-job";
import { RunSettingsCard, type SourceOption } from "@/scraper/components/run-settings-card";
import { RunStatusCard } from "@/scraper/components/run-status-card";
import { LiveProductsCard } from "@/scraper/components/live-products-card";
import { OutputFilesCard } from "@/scraper/components/output-files-card";
import { PriceListCard } from "@/scraper/components/price-list-card";
import { CatalogResultsCard } from "@/scraper/components/catalog-results-card";
import { PanelSection } from "@/scraper/components/panel-section";
import { isJobStatusActive } from "@/scraper/lib/scraper-job-status";
import { JOB_STATUS_LABELS } from "@/scraper/lib/scraper-labels";

/**
 * The scraper panel: one hook, six cards, and the conditions that decide which of them exist.
 *
 * Every piece of state the panel has lives in `useScraperJob`, called once here and unconditionally.
 * Nothing below this line owns state except the components that owned it before the split — the
 * product editor's draft fields, the multi-select's open flag, the thumbnail's image index — so
 * moving a card out of this file cannot have moved a `useState` with it.
 */
export function ScraperPanel({ sources }: { sources: SourceOption[] }) {
  const panel = useScraperJob();
  const {
    job, loading, busy, notice, live, active, refresh, start, cancel,
    progress, progressCurrent, progressTotal,
    catalog, catalogLoading, edits, selected, detail, setDetail,
    filteredCatalog, subcategoryOptions, manufacturerOptions, websiteOptions,
    filtersActive, allFilteredSelected, clearFilters, toggleAll, toggleSelected,
    updateItemEdit, resetItemEdit,
    publish, setPublish, importing, importMessage, importSelected,
    source, setSource, limit, setLimit, cache, setCache, downloadImages, setDownloadImages, priceLookup, setPriceLookup,
    scrapeSearch, setScrapeSearch, scrapeManufacturer, setScrapeManufacturer,
    scrapeWebsite, setScrapeWebsite, scrapeCategory, setScrapeCategory,
    scrapeSubCategory, setScrapeSubCategory, scrapeColor, setScrapeColor,
    scrapePrice, setScrapePrice, scrapeContent, setScrapeContent, scrapeSort, setScrapeSort,
    scrapeSubcategoryOptions, clearScrapeFilters, copyReviewFiltersToScrape,
    query, setQuery, manufacturerFilter, setManufacturerFilter, websiteFilter, setWebsiteFilter,
    rootFilter, setRootFilter, subFilter, setSubFilter, colorFilter, setColorFilter,
    priceFilter, setPriceFilter, contentFilter, setContentFilter, sortOrder, setSortOrder,
    priceListFile, priceListBrand, priceListUnit, priceListBusy, priceListReport, priceListNotice,
    choosePriceList, changePriceListBrand, changePriceListUnit, submitPriceList,
  } = panel;

  const status = job ? JOB_STATUS_LABELS[job.status] : JOB_STATUS_LABELS.idle;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">اسکرپر کاتالوگ</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ash">
            داده خام سازنده را می‌گیرد، به سبک فروشگاه فارسی تبدیل می‌کند و نتایج را برای بررسی و ورود به فروشگاه آماده می‌کند.
          </p>
        </div>
        <Badge className={status.badgeClass}>{status.label}</Badge>
      </div>

      <PanelSection
        step={1}
        title="اجرای اسکرپ"
        description="منبع و محدودیت را انتخاب کنید و اجرا را شروع کنید؛ فیلترها پیش از خواندن هر صفحهٔ محصول اعمال می‌شوند."
      >
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <RunSettingsCard
            sources={sources}
            active={active}
            busy={busy}
            notice={notice}
            source={source}
            setSource={setSource}
            limit={limit}
            setLimit={setLimit}
            cache={cache}
            setCache={setCache}
            downloadImages={downloadImages}
            setDownloadImages={setDownloadImages}
            priceLookup={priceLookup}
            setPriceLookup={setPriceLookup}
            scrapeSearch={scrapeSearch}
            setScrapeSearch={setScrapeSearch}
            scrapeManufacturer={scrapeManufacturer}
            setScrapeManufacturer={setScrapeManufacturer}
            scrapeWebsite={scrapeWebsite}
            setScrapeWebsite={setScrapeWebsite}
            scrapeCategory={scrapeCategory}
            setScrapeCategory={setScrapeCategory}
            scrapeSubCategory={scrapeSubCategory}
            setScrapeSubCategory={setScrapeSubCategory}
            scrapeColor={scrapeColor}
            setScrapeColor={setScrapeColor}
            scrapePrice={scrapePrice}
            setScrapePrice={setScrapePrice}
            scrapeContent={scrapeContent}
            setScrapeContent={setScrapeContent}
            scrapeSort={scrapeSort}
            setScrapeSort={setScrapeSort}
            manufacturerOptions={manufacturerOptions}
            websiteOptions={websiteOptions}
            scrapeSubcategoryOptions={scrapeSubcategoryOptions}
            clearScrapeFilters={clearScrapeFilters}
            copyReviewFiltersToScrape={copyReviewFiltersToScrape}
            start={start}
            cancel={cancel}
          />
          <RunStatusCard
            job={job}
            loading={loading}
            notice={notice}
            refresh={refresh}
            progress={progress}
            progressCurrent={progressCurrent}
            progressTotal={progressTotal}
          />
        </div>
      </PanelSection>

      {job && isJobStatusActive(job.status) ? (
        <PanelSection
          step={2}
          title="محصولات در حال دریافت"
          description="هر محصولی که خوانده می‌شود همین‌جا ظاهر می‌شود؛ پس از پایان، فهرست نهایی در بخش بررسی و ورود قرار می‌گیرد."
        >
          <LiveProductsCard live={live} />
        </PanelSection>
      ) : null}

      {job?.status === "completed" || catalog.length > 0 ? (
        <PanelSection
          step={3}
          title="بررسی و ورود به فروشگاه"
          description="خروجی اجرا را بردارید، در صورت نیاز لیست قیمت را اعمال کنید و سپس محصولات انتخاب‌شده را وارد کنید."
        >
          <div className="space-y-6">
            <OutputFilesCard job={job} />

            <PriceListCard
              file={priceListFile}
              brand={priceListBrand}
              unit={priceListUnit}
              busy={priceListBusy}
              report={priceListReport}
              notice={priceListNotice}
              onFileChange={choosePriceList}
              onBrandChange={changePriceListBrand}
              onUnitChange={changePriceListUnit}
              onPreview={() => void submitPriceList("preview")}
              onApply={() => void submitPriceList("apply")}
            />

            <CatalogResultsCard
              catalogLoading={catalogLoading}
              catalogCount={catalog.length}
              filteredCatalog={filteredCatalog}
              selected={selected}
              detail={detail}
              setDetail={setDetail}
              query={query}
              setQuery={setQuery}
              manufacturerFilter={manufacturerFilter}
              setManufacturerFilter={setManufacturerFilter}
              websiteFilter={websiteFilter}
              setWebsiteFilter={setWebsiteFilter}
              rootFilter={rootFilter}
              setRootFilter={setRootFilter}
              subFilter={subFilter}
              setSubFilter={setSubFilter}
              colorFilter={colorFilter}
              setColorFilter={setColorFilter}
              priceFilter={priceFilter}
              setPriceFilter={setPriceFilter}
              contentFilter={contentFilter}
              setContentFilter={setContentFilter}
              sortOrder={sortOrder}
              setSortOrder={setSortOrder}
              subcategoryOptions={subcategoryOptions}
              manufacturerOptions={manufacturerOptions}
              websiteOptions={websiteOptions}
              filtersActive={filtersActive}
              allFilteredSelected={allFilteredSelected}
              clearFilters={clearFilters}
              toggleAll={toggleAll}
              toggleSelected={toggleSelected}
              edits={edits}
              publish={publish}
              setPublish={setPublish}
              importing={importing}
              importMessage={importMessage}
              importSelected={importSelected}
              notice={notice}
              onSaveEdit={updateItemEdit}
              onResetEdit={resetItemEdit}
            />
          </div>
        </PanelSection>
      ) : null}
    </div>
  );
}

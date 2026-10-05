"use client";

import { formatToman, toFaDigits } from "@kmodern/contracts";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kmodern/ui";
import { Field, Select, Spinner } from "@/components/panel-ui";
import { ProductThumbnail } from "@/scraper/components/product-media";
import { ProductDetail } from "@/scraper/components/product-detail";
import { COLOR_LABELS, ROOT_LABELS, SUB_LABELS, labelOptions } from "@/scraper/lib/scraper-labels";
import { websiteLabel, type ContentFilter, type PriceFilter, type SortOrder } from "@/scraper/lib/scraper-catalog";
import type { ScraperNotice } from "@/scraper/hooks/use-scraper-job";
import type { ScraperCatalogEdit, ScraperCatalogItem } from "@/scraper/lib/scraper-types";

/**
 * The review table: the run's output, filtered, sorted, selected, edited and imported.
 *
 * Every setter arrives as a prop rather than being read from a context, because this is where the
 * panel's state is most likely to be silently reshaped: a filter that resets on its own, a selection
 * that loses a row, an edit that stops applying. Naming each of them in the prop list makes that a
 * compile error instead of a bug report.
 */
export function CatalogResultsCard({
  catalogLoading,
  catalogCount,
  filteredCatalog,
  selected,
  detail,
  setDetail,
  query,
  setQuery,
  manufacturerFilter,
  setManufacturerFilter,
  websiteFilter,
  setWebsiteFilter,
  rootFilter,
  setRootFilter,
  subFilter,
  setSubFilter,
  colorFilter,
  setColorFilter,
  priceFilter,
  setPriceFilter,
  contentFilter,
  setContentFilter,
  sortOrder,
  setSortOrder,
  subcategoryOptions,
  manufacturerOptions,
  websiteOptions,
  filtersActive,
  allFilteredSelected,
  clearFilters,
  toggleAll,
  toggleSelected,
  edits,
  publish,
  setPublish,
  importing,
  importMessage,
  importSelected,
  notice,
  onSaveEdit,
  onResetEdit,
}: {
  catalogLoading: boolean;
  catalogCount: number;
  filteredCatalog: ScraperCatalogItem[];
  selected: Set<string>;
  detail: ScraperCatalogItem | null;
  setDetail: (item: ScraperCatalogItem | null) => void;
  query: string;
  setQuery: (value: string) => void;
  manufacturerFilter: string;
  setManufacturerFilter: (value: string) => void;
  websiteFilter: string;
  setWebsiteFilter: (value: string) => void;
  rootFilter: string;
  setRootFilter: (value: string) => void;
  subFilter: string;
  setSubFilter: (value: string) => void;
  colorFilter: string;
  setColorFilter: (value: string) => void;
  priceFilter: PriceFilter;
  setPriceFilter: (value: PriceFilter) => void;
  contentFilter: ContentFilter;
  setContentFilter: (value: ContentFilter) => void;
  sortOrder: SortOrder;
  setSortOrder: (value: SortOrder) => void;
  subcategoryOptions: string[];
  manufacturerOptions: string[];
  websiteOptions: Array<[string, string]>;
  filtersActive: boolean;
  allFilteredSelected: boolean;
  clearFilters: () => void;
  toggleAll: () => void;
  toggleSelected: (slug: string) => void;
  edits: Record<string, ScraperCatalogEdit>;
  publish: boolean;
  setPublish: (value: boolean) => void;
  importing: boolean;
  importMessage: string | null;
  importSelected: () => void;
  notice: ScraperNotice | null;
  onSaveEdit: (slug: string, patch: ScraperCatalogEdit) => void;
  onResetEdit: (slug: string) => void;
}) {
  return (
    <>
        {catalogLoading ? (
          <Card>
            <CardContent>
              <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-ash"><Spinner /> در حال آماده‌سازی فهرست…</div>
            </CardContent>
          </Card>
        ) : catalogCount ? (
          <>
            <Card>
              <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">فیلترها</h3>
                  <p className="mt-0.5 text-sm text-ash">فهرست را برای رسیدن به محصولات موردنظر محدود کنید؛ فیلترها چیزی را تغییر نمی‌دهند.</p>
                </div>
                <div className="shrink-0"><span className="text-xs text-ash">{toFaDigits(filteredCatalog.length)} از {toFaDigits(catalogCount)}</span></div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="جستجو" className="mb-0">
                <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="نام، مدل، سازنده یا منبع…" />
              </Field>
              <Field label="سازنده" className="mb-0" hint="برند درج‌شده در داده سازنده">
                 <Select value={manufacturerFilter} onChange={(event) => setManufacturerFilter(event.target.value)}>
                   <option value="all">همه سازنده‌ها</option>
                   {manufacturerOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                 </Select>
               </Field>
               <Field label="وب‌سایت منبع" className="mb-0" hint="وب‌سایتی که محصول از آن خوانده شده">
                 <Select value={websiteFilter} onChange={(event) => setWebsiteFilter(event.target.value)}>
                   <option value="all">همه وب‌سایت‌ها</option>
                   {websiteOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                 </Select>
               </Field>
               <Field label="دسته اصلی" className="mb-0">
                <Select value={rootFilter} onChange={(event) => { setRootFilter(event.target.value); setSubFilter("all"); }}>
                  <option value="all">همه دسته‌ها</option>
                  {labelOptions(ROOT_LABELS).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </Field>
              <Field label="زیر‌دسته" className="mb-0">
                <Select value={subFilter} onChange={(event) => setSubFilter(event.target.value)}>
                  <option value="all">همه زیر‌دسته‌ها</option>
                  {subcategoryOptions.map((value) => <option key={value} value={value}>{SUB_LABELS[value] ?? value}</option>)}
                </Select>
              </Field>
              <Field label="رنگ" className="mb-0">
                <Select value={colorFilter} onChange={(event) => setColorFilter(event.target.value)}>
                  <option value="all">همه رنگ‌ها</option>
                  {labelOptions(COLOR_LABELS).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </Field>
              <Field label="وضعیت قیمت" className="mb-0">
                <Select value={priceFilter} onChange={(event) => setPriceFilter(event.target.value as PriceFilter)}>
                  <option value="all">همه</option>
                  <option value="priced">دارای قیمت</option>
                  <option value="missing">نیازمند قیمت</option>
                </Select>
              </Field>
              <Field label="محتوا" className="mb-0">
                <Select value={contentFilter} onChange={(event) => setContentFilter(event.target.value as ContentFilter)}>
                  <option value="all">همه</option>
                  <option value="with-images">دارای تصویر</option>
                  <option value="without-images">بدون تصویر</option>
                  <option value="with-specs">دارای مشخصات</option>
                </Select>
              </Field>
              <Field label="مرتب‌سازی" className="mb-0">
                <Select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)}>
                  <option value="newest">جدیدترین</option>
                  <option value="name">نام محصول</option>
                  <option value="price-high">بیشترین قیمت</option>
                  <option value="price-low">کمترین قیمت</option>
                </Select>
              </Field>
              <div className="flex items-end">
                <Button type="button" variant="outline" size="sm" onClick={clearFilters} disabled={!filtersActive}>پاک کردن فیلترها</Button>
              </div>
              </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">انتخاب و ورود به فروشگاه</h3>
                  <p className="mt-0.5 text-sm text-ash">محصولات تیک‌خورده با هم وارد می‌شوند؛ «همه نتایج فیلترشده» فقط روی همین فهرست اثر دارد.</p>
                </div>
                <div className="shrink-0"><span className="text-xs text-ash">{toFaDigits(selected.size)} انتخاب‌شده</span></div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-fog text-flame-700 focus:ring-flame-500"
                  checked={allFilteredSelected}
                  onChange={toggleAll}
                />
                انتخاب همه نتایج فیلترشده
              </label>
              <span className="text-xs text-ash">{toFaDigits(selected.size)} انتخاب‌شده</span>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
                  <Checkbox checked={publish} onCheckedChange={(checked) => setPublish(checked === true)} />
                  پس از ورود منتشر کن
                </label>
                <Button type="button" onClick={importSelected} disabled={!selected.size || importing}>
                  {importing ? <Spinner /> : null}
                  {publish ? "ارسال و انتشار به فروشگاه" : "ذخیره به‌عنوان پیش‌نویس"}
                </Button>
              </div>
                </div>
                {importMessage ? <p className="mt-3 notice-success-strong">{importMessage}</p> : null}
                {notice?.kind === "error" ? <p role="alert" className="mt-3 notice-error-strong">{notice.text}</p> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">فهرست محصولات</h3>
                  <p className="mt-0.5 text-sm text-ash">روی هر ردیف کلیک کنید تا توضیحات، تصاویر و مشخصات کامل آن در بخش بعدی باز شود.</p>
                </div>
              </CardHeader>
              <CardContent>
            {filteredCatalog.length ? (
              <div className="overflow-hidden rounded-card border border-plaster">
                <div role="region" aria-label="جدول داده‌ها" tabIndex={0} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flame-300">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>محصول</TableHead>
                        <TableHead className="w-20">تصویر</TableHead>
                        <TableHead>سازنده / منبع</TableHead>
                        <TableHead>دسته</TableHead>
                        <TableHead>قیمت</TableHead>
                        <TableHead>مشخصات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCatalog.map((item) => (
                        <TableRow
                          key={item.slug}
                          role="button"
                          tabIndex={0}
                          onClick={() => setDetail(item)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setDetail(item);
                            }
                          }}
                          aria-label={`جزئیات ${item.name}`}
                          className={selected.has(item.slug) ? "bg-flame-50" : undefined}
                        >
                          <TableCell>
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-fog text-flame-700 focus:ring-flame-500"
                              checked={selected.has(item.slug)}
                              onChange={() => toggleSelected(item.slug)}
                              onClick={(event) => event.stopPropagation()}
                              aria-label={`انتخاب ${item.name}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-ink">{item.name}</span>{edits[item.slug] ? <Badge className="bg-flame-100 text-flame-800">ویرایش‌شده</Badge> : null}</div>
                            <div className="mt-1 text-xs text-ash" dir="ltr">{item.slug}</div>
                          </TableCell>
                          <TableCell><ProductThumbnail item={item} /></TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-ash">
                            <div className="text-ink">{item.brand || "نامشخص"}</div>
                            <div className="mt-1" dir="ltr">{websiteLabel(item)}</div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-ash">{ROOT_LABELS[item.category] ?? item.category} / {SUB_LABELS[item.subCategory] ?? item.subCategory}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{item.priceInStock === false ? <span className="text-red-700">ناموجود</span> : item.price > 0 ? formatToman(item.price) : <span className="text-amber-700">نیازمند قیمت</span>}</TableCell>
                          <TableCell className="tabular-nums text-xs text-ash">{toFaDigits(item.specs.length)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <p className="rounded-card bg-plaster px-3 py-8 text-center text-sm text-ash">محصولی با این فیلترها پیدا نشد.</p>
            )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">جزئیات محصول</h3>
                  <p className="mt-0.5 text-sm text-ash">ویرایش نام، قیمت، توضیحات، ویژگی‌ها و مشخصات پیش از ورود به فروشگاه.</p>
                </div>
              </CardHeader>
              <CardContent>
                {detail ? (
                  <ProductDetail item={detail} onClose={() => setDetail(null)} onSave={(patch) => onSaveEdit(detail.slug, patch)} onReset={() => onResetEdit(detail.slug)} />
                ) : (
                  <p className="text-sm text-ash">برای دیدن توضیحات، تصاویر و مشخصات کامل، روی یک ردیف کلیک کنید.</p>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent>
              <p className="text-sm text-ash">خروجی محصولی برای نمایش پیدا نشد.</p>
            </CardContent>
          </Card>
        )}
    </>
  );
}

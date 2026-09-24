"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatToman } from "@kmodern/schema";
import { formatJalaliDateTime } from "@/lib/date";
import type { ScraperCatalogItem, ScraperJobSnapshot, ScraperJobStatus } from "@/lib/scraper-types";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Field,
  Input,
  Select,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  faDigits,
} from "@/components/ui";

interface SourceOption {
  id: string;
  label: string;
}

interface ImportResult {
  products: number;
  variants: number;
  status: "DRAFT" | "PUBLISHED";
}

const STATUS: Record<ScraperJobStatus, { label: string; color: "gray" | "blue" | "green" | "amber" | "red" }> = {
  idle: { label: "آماده", color: "gray" },
  running: { label: "در حال اجرا", color: "blue" },
  cancelling: { label: "در حال لغو", color: "amber" },
  completed: { label: "پایان یافت", color: "green" },
  failed: { label: "ناموفق", color: "red" },
  cancelled: { label: "لغو شد", color: "amber" },
};

const PHASE: Record<ScraperJobSnapshot["phase"], string> = {
  idle: "آماده",
  discovering: "پیدا کردن صفحه‌های محصول",
  scraping: "خواندن صفحه‌های محصول",
  refining: "پالایش متن و ادغام داده‌ها",
  writing: "نوشتن فایل خروجی",
  complete: "پایان اجرا",
};

const ROOT_LABELS: Record<string, string> = {
  sink: "سینک",
  hood: "هود",
  oven: "فر",
  stove: "اجاق گاز",
  "air-fryer": "سرخ‌کن",
};

const SUB_LABELS: Record<string, string> = {
  "double-bowl": "دولگن",
  "built-in": "توکار",
  chimney: "شومینه‌ای",
  steel: "استیل",
  glass: "شیشه‌ای",
  "dual-basket": "دوسبد",
};

const COLOR_LABELS: Record<string, string> = {
  black: "مشکی",
  white: "سفید",
  gray: "طوسی",
  beige: "کرم",
  silver: "نقره‌ای",
  steel: "استیل",
};

type PriceFilter = "all" | "priced" | "missing";
type SortOrder = "newest" | "name" | "price-high" | "price-low";

async function apiRequest<T>(path = "/api/admin/scraper", init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "پاسخ نامعتبر از سرور");
  return data;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "درخواست ناموفق بود";
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  try {
    return formatJalaliDateTime(new Date(value));
  } catch {
    return "—";
  }
}

export function ScraperPanel({ sources }: { sources: SourceOption[] }) {
  const [job, setJob] = useState<ScraperJobSnapshot | null>(null);
  const [catalog, setCatalog] = useState<ScraperCatalogItem[]>([]);
  const [catalogJobId, setCatalogJobId] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ScraperCatalogItem | null>(null);
  const [query, setQuery] = useState("");
  const [rootFilter, setRootFilter] = useState("all");
  const [subFilter, setSubFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [contentFilter, setContentFilter] = useState<"all" | "with-images" | "without-images" | "with-specs">("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [source, setSource] = useState("all");
  const [limit, setLimit] = useState("");
  const [cache, setCache] = useState(true);
  const [publish, setPublish] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const active = starting || job?.status === "running" || job?.status === "cancelling";
  const progress = useMemo(() => {
    if (!job?.total) return job && active ? 8 : 0;
    return Math.min(100, Math.round((job.current / job.total) * 100));
  }, [active, job]);

  const subcategoryOptions = useMemo(() => {
    const values = catalog
      .filter((item) => rootFilter === "all" || item.category === rootFilter)
      .map((item) => item.subCategory);
    return [...new Set(values)].sort((a, b) => (SUB_LABELS[a] ?? a).localeCompare(SUB_LABELS[b] ?? b, "fa"));
  }, [catalog, rootFilter]);

  const filteredCatalog = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fa");
    const filtered = catalog.filter((item) => {
      const searchable = [item.name, item.brand, item._id, item.slug, item.description]
        .join(" ")
        .toLocaleLowerCase("fa");
      if (normalizedQuery && !searchable.includes(normalizedQuery)) return false;
      if (rootFilter !== "all" && item.category !== rootFilter) return false;
      if (subFilter !== "all" && item.subCategory !== subFilter) return false;
      if (colorFilter !== "all" && !item.colors.includes(colorFilter)) return false;
      if (priceFilter === "priced" && item.price <= 0) return false;
      if (priceFilter === "missing" && item.price > 0) return false;
      if (contentFilter === "with-images" && item.image.length === 0) return false;
      if (contentFilter === "without-images" && item.image.length > 0) return false;
      if (contentFilter === "with-specs" && item.specs.length === 0) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (sortOrder === "name") return a.name.localeCompare(b.name, "fa");
      if (sortOrder === "price-high") return b.price - a.price;
      if (sortOrder === "price-low") return a.price - b.price;
      return b.date - a.date;
    });
  }, [catalog, colorFilter, contentFilter, priceFilter, query, rootFilter, sortOrder, subFilter]);

  const filtersActive = Boolean(
    query || rootFilter !== "all" || subFilter !== "all" || colorFilter !== "all" ||
    priceFilter !== "all" || contentFilter !== "all" || sortOrder !== "newest",
  );
  const allFilteredSelected = filteredCatalog.length > 0 && filteredCatalog.every((item) => selected.has(item.slug));

  const refresh = useCallback(async () => {
    try {
      setJob(await apiRequest<ScraperJobSnapshot>());
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(timer);
  }, [active, refresh]);

  useEffect(() => {
    if (active || catalogJobId) return;
    let cancelled = false;
    setCatalogLoading(true);
    void apiRequest<{ items: ScraperCatalogItem[] }>("/api/admin/scraper?view=catalog")
      .then((data) => {
        if (cancelled) return;
        setCatalog(data.items);
        setCatalogJobId(job?.id ?? "persisted");
        setSelected(new Set());
        setDetail(null);
      })
      .catch((error) => {
        if (!cancelled) setNotice({ kind: "error", text: errorText(error) });
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, catalogJobId, job?.id]);

  async function start() {
    setBusy(true);
    setStarting(true);
    setNotice(null);
    setImportMessage(null);
    setCatalog([]);
    setCatalogJobId("");
    setQuery("");
    setRootFilter("all");
    setSubFilter("all");
    setColorFilter("all");
    setPriceFilter("all");
    setContentFilter("all");
    setSortOrder("newest");
    setJob(null);
    setSelected(new Set());
    setDetail(null);
    try {
      const body = JSON.stringify({
        source,
        limit: limit.trim() ? Number(limit) : null,
        cache,
      });
      setJob(await apiRequest<ScraperJobSnapshot>( "/api/admin/scraper", { method: "POST", body }));
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error) });
    } finally {
      setStarting(false);
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setNotice(null);
    try {
      setJob(await apiRequest<ScraperJobSnapshot>("/api/admin/scraper", { method: "DELETE" }));
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(slug: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      for (const item of filteredCatalog) {
        if (allFilteredSelected) next.delete(item.slug);
        else next.add(item.slug);
      }
      return next;
    });
  }

  function clearFilters() {
    setQuery("");
    setRootFilter("all");
    setSubFilter("all");
    setColorFilter("all");
    setPriceFilter("all");
    setContentFilter("all");
    setSortOrder("newest");
  }

  async function importSelected() {
    if (!selected.size) return;
    const mode = publish ? "منتشر کردن" : "ذخیره به‌عنوان پیش‌نویس";
    if (!window.confirm(`${faDigits(selected.size)} محصول انتخاب شده است. آن‌ها ${mode} شوند؟`)) return;
    setImporting(true);
    setNotice(null);
    setImportMessage(null);
    try {
      const result = await apiRequest<ImportResult>("/api/admin/scraper/import", {
        method: "POST",
        body: JSON.stringify({ slugs: [...selected], publish }),
      });
      setImportMessage(`${faDigits(result.products)} محصول و ${faDigits(result.variants)} تنوع با موفقیت وارد شد.`);
      setSelected(new Set());
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error) });
    } finally {
      setImporting(false);
    }
  }

  const status = job ? STATUS[job.status] : STATUS.idle;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">اسکرپر کاتالوگ</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ash">
            داده خام سازنده را می‌گیرد، به سبک فروشگاه فارسی تبدیل می‌کند و نتایج را برای بررسی و ورود به فروشگاه آماده می‌کند.
          </p>
        </div>
        <Badge color={status.color}>{status.label}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <Card>
          <CardHeader title="تنظیمات اجرا" subtitle="برای تست سریع، محدودیت محصول را وارد کنید." />
          <CardBody>
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
            <div className="mb-5 rounded-card bg-plaster px-3 py-3">
              <Checkbox
                label="استفاده از کش HTML"
                checked={cache}
                onChange={(event) => setCache(event.target.checked)}
                disabled={active}
              />
              <p className="mt-1 pr-6 text-xs leading-5 text-ash">اجرای بعدی سریع‌تر است و درخواست کمتری به سایت سازنده ارسال می‌کند.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void start()} disabled={active || busy}>
                {busy && !active ? <Spinner /> : null}
                شروع اسکرپ
              </Button>
              {active ? (
                <Button type="button" variant="danger" onClick={() => void cancel()} disabled={busy}>
                  لغو اجرا
                </Button>
              ) : null}
            </div>
            {notice ? (
              <p role="alert" className={`mt-4 text-sm ${notice.kind === "error" ? "text-red-700" : "text-flame-800"}`}>
                {notice.text}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="وضعیت اجرا"
            subtitle={job ? PHASE[job.phase] : "هنوز اجرایی آغاز نشده است."}
            actions={job?.startedAt ? <span className="text-xs text-ash">شروع: {formatTime(job.startedAt)}</span> : undefined}
          />
          <CardBody>
            {loading ? (
              <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-ash">
                <Spinner /> در حال دریافت وضعیت…
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-ink">پیشرفت</span>
                    <span className="tabular-nums text-ash">
                      {job?.total ? `${faDigits(job.current)} / ${faDigits(job.total)}` : "—"}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-[30px] bg-plaster" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-[30px] bg-flame-700 transition-[width] duration-200" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-4">
                  <Metric label="رکورد خام" value={job?.records ?? 0} />
                  <Metric label="محصول نهایی" value={job?.kept ?? 0} />
                  <Metric label="ادغام‌شده" value={job?.merged ?? 0} />
                  <Metric label="خطا" value={job?.errors ?? 0} danger={(job?.errors ?? 0) > 0} />
                </dl>

                {job?.error ? (
                  <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-800">{job.error}</p>
                ) : null}

                <div>
                  <h2 className="mb-2 text-sm font-semibold text-ink">رویدادها</h2>
                  {job?.activity.length ? (
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
          </CardBody>
        </Card>
      </div>

      {job?.status === "completed" ? (
        <>
          <Card>
            <CardHeader title="خروجی و راهنمای فایل‌ها" subtitle="هر فایل کار متفاوتی انجام می‌دهد؛ فایل مناسب هر مرحله را از راهنمای زیر انتخاب کنید." />
            <CardBody>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <DownloadLink filename="catalog.fragment.json" label="کاتالوگ نهایی" description="مناسب ورود به فروشگاه" />
                <DownloadLink filename="raw-scrape.json" label="داده خام سازنده" description="برای بررسی و رفع اشکال" />
                <DownloadLink filename="merge-report.json" label="گزارش ادغام و خطاها" description="برای دیدن تعداد و تعارض‌ها" />
              </div>
              <div className="mt-4 rounded-card bg-plaster px-4 py-3 text-sm leading-6">
                <p className="font-semibold text-ink">کدام فایل را استفاده کنم؟</p>
                <p className="mt-1 text-ash"><strong className="text-ink">کاتالوگ نهایی</strong> همان فایلی است که برای بررسی محصولات و ورود انتخاب‌شده به فروشگاه استفاده می‌شود. <strong className="text-ink">داده خام</strong> فقط برای عیب‌یابی scraper است و <strong className="text-ink">گزارش ادغام</strong> می‌گوید چه چیزی حذف، ادغام یا با خطا مواجه شده است.</p>
              </div>
              {job.outputDir ? <p className="mt-4 break-all text-xs leading-5 text-ash" dir="ltr">{job.outputDir}</p> : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="نتایج محصولات"
              subtitle={catalogLoading ? "در حال خواندن خروجی…" : `${faDigits(filteredCatalog.length)} از ${faDigits(catalog.length)} محصول برای بررسی آماده است.`}
              actions={catalog.length ? <span className="text-xs text-ash">{faDigits(selected.size)} انتخاب شده</span> : undefined}
            />
            <CardBody>
              {catalogLoading ? (
                <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-ash"><Spinner /> در حال آماده‌سازی فهرست…</div>
              ) : catalog.length ? (
                <>
                  <div className="mb-4 grid grid-cols-1 gap-3 rounded-card bg-plaster p-3 md:grid-cols-2 xl:grid-cols-4">
                    <Field label="جستجو" className="mb-0">
                      <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="نام، مدل یا توضیح…" />
                    </Field>
                    <Field label="دسته اصلی" className="mb-0">
                      <Select value={rootFilter} onChange={(event) => { setRootFilter(event.target.value); setSubFilter("all"); }}>
                        <option value="all">همه دسته‌ها</option>
                        {Object.entries(ROOT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
                        {Object.entries(COLOR_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
                      <Select value={contentFilter} onChange={(event) => setContentFilter(event.target.value as typeof contentFilter)}>
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
                      <Button type="button" variant="secondary" size="sm" onClick={clearFilters} disabled={!filtersActive}>پاک کردن فیلترها</Button>
                    </div>
                  </div>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card bg-plaster px-3 py-3">
                    <label className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-fog text-flame-700 focus:ring-flame-500"
                        checked={allFilteredSelected}
                        onChange={toggleAll}
                      />
                      انتخاب همه نتایج فیلترشده
                    </label>
                    <span className="text-xs text-ash">{faDigits(selected.size)} انتخاب‌شده</span>
                    <div className="flex flex-wrap items-center gap-3">
                      <Checkbox label="پس از ورود منتشر کن" checked={publish} onChange={(event) => setPublish(event.target.checked)} />
                      <Button type="button" onClick={() => void importSelected()} disabled={!selected.size || importing}>
                        {importing ? <Spinner /> : null}
                        {publish ? "ارسال و انتشار به فروشگاه" : "ذخیره به‌عنوان پیش‌نویس"}
                      </Button>
                    </div>
                  </div>
                  {importMessage ? <p className="mb-4 rounded-card bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{importMessage}</p> : null}
                  {notice?.kind === "error" ? <p role="alert" className="mb-4 rounded-card bg-red-50 px-3 py-2 text-sm text-red-800">{notice.text}</p> : null}
                  {filteredCatalog.length ? (
                    <div className="overflow-hidden rounded-card border border-plaster">
                      <Table>
                        <THead>
                          <TR>
                            <TH className="w-10" />
                            <TH>محصول</TH>
                            <TH>دسته</TH>
                            <TH>قیمت</TH>
                            <TH>مشخصات</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {filteredCatalog.map((item) => (
                            <TR key={item.slug} onClick={() => setDetail(item)} className={selected.has(item.slug) ? "bg-flame-50" : undefined}>
                              <TD>
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-fog text-flame-700 focus:ring-flame-500"
                                  checked={selected.has(item.slug)}
                                  onChange={() => toggleSelected(item.slug)}
                                  onClick={(event) => event.stopPropagation()}
                                  aria-label={`انتخاب ${item.name}`}
                                />
                              </TD>
                              <TD>
                                <div className="font-medium text-ink">{item.name}</div>
                                <div className="mt-1 text-xs text-ash" dir="ltr">{item.slug}</div>
                              </TD>
                              <TD className="whitespace-nowrap text-xs text-ash">{ROOT_LABELS[item.category] ?? item.category} / {SUB_LABELS[item.subCategory] ?? item.subCategory}</TD>
                              <TD className="whitespace-nowrap text-xs">{item.price > 0 ? formatToman(item.price) : <span className="text-amber-700">نیازمند قیمت</span>}</TD>
                              <TD className="tabular-nums text-xs text-ash">{faDigits(item.specs.length)}</TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="rounded-card bg-plaster px-3 py-8 text-center text-sm text-ash">محصولی با این فیلترها پیدا نشد.</p>
                  )}
                  {detail ? <ProductDetail item={detail} onClose={() => setDetail(null)} /> : <p className="mt-4 text-sm text-ash">برای دیدن توضیحات، تصاویر و مشخصات کامل، روی یک ردیف کلیک کنید.</p>}
                </>
              ) : (
                <p className="text-sm text-ash">خروجی محصولی برای نمایش پیدا نشد.</p>
              )}
            </CardBody>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ash">{label}</dt>
      <dd className={`mt-1 font-semibold tabular-nums ${danger ? "text-red-700" : "text-ink"}`}>{faDigits(value)}</dd>
    </div>
  );
}

function DownloadLink({ filename, label, description }: { filename: string; label: string; description: string }) {
  return (
    <a
      href={`/api/admin/scraper?download=${encodeURIComponent(filename)}`}
      className="rounded-card border border-fog px-3 py-2 text-sm text-ink transition-colors hover:bg-plaster focus:outline-none focus:ring-2 focus:ring-flame-300"
    >
      <span className="block font-medium">{label}</span>
      <span className="mt-0.5 block text-xs text-ash">{description}</span>
      <span className="mt-1 block text-[11px] text-ash" dir="ltr">{filename}</span>
    </a>
  );
}

function ProductDetail({ item, onClose }: { item: ScraperCatalogItem; onClose: () => void }) {
  return (
    <div className="mt-5 rounded-card border border-plaster bg-plaster/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{item.name}</h2>
          <p className="mt-1 text-xs text-ash" dir="ltr">{item.slug} · {item._id}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>بستن</Button>
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-ink">{item.description || "توضیحی برای این محصول ثبت نشده است."}</p>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">ویژگی‌ها</h3>
          {item.features.length ? <ul className="space-y-1 text-sm leading-6 text-ash">{item.features.map((feature) => <li key={feature}>• {feature}</li>)}</ul> : <p className="text-sm text-ash">—</p>}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">مشخصات فنی</h3>
          {item.specs.length ? <dl className="divide-y divide-plaster text-sm">{item.specs.map((spec) => <div key={`${spec.label}-${spec.value}`} className="flex justify-between gap-4 py-2"><dt className="text-ash">{spec.label}</dt><dd className="text-left text-ink">{spec.value}</dd></div>)}</dl> : <p className="text-sm text-ash">—</p>}
        </div>
      </div>
      {item.image.length ? <div className="mt-5"><h3 className="mb-2 text-sm font-semibold text-ink">تصاویر</h3><div className="flex flex-wrap gap-2">{item.image.slice(0, 8).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded-card border border-plaster bg-white"><img src={url} alt={item.name} className="h-full w-full object-contain" loading="lazy" /></a>)}</div></div> : null}
    </div>
  );
}

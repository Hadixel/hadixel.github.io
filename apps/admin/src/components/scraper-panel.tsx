"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { formatToman } from "@kmodern/schema";
import { formatJalaliDateTime } from "@/lib/date";
import type { ScrapeFilters, ScraperCatalogEdit, ScraperCatalogItem, ScraperJobSnapshot, ScraperJobStatus } from "@/lib/scraper-types";
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
  Textarea,
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
  images: number;
  imageErrors: number;
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
  downloading: "دریافت تصاویر محصولات",
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
  concealed: "مخفی",
  wall: "دیواری",
  steel: "استیل",
  granite: "گرانیتی",
  glass: "شیشه‌ای",
  freestanding: "رومیزی",
  "dual-basket": "دوسبد",
};

const SCRAPE_SUB_LABELS: Record<string, string[]> = {
  sink: ["steel", "granite"],
  hood: ["chimney", "concealed", "wall", "glass"],
  oven: ["built-in", "steel", "glass"],
  stove: ["built-in", "freestanding"],
  "air-fryer": ["dual-basket"],
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

function websiteKey(item: ScraperCatalogItem): string {
  if (item.sourceUrl) {
    try {
      return new URL(item.sourceUrl).hostname.toLocaleLowerCase("en");
    } catch {
      // Fall through to the stable adapter id.
    }
  }
  return item.sourceId?.toLocaleLowerCase("en") || "unknown";
}

function websiteLabel(item: ScraperCatalogItem): string {
  if (item.sourceUrl) {
    try {
      return new URL(item.sourceUrl).hostname;
    } catch {
      // Fall through to the adapter id.
    }
  }
  return item.sourceId || "نامشخص";
}

const SCRAPE_FILTER_LABELS: Record<string, string> = {
  search: "جستجو",
  manufacturer: "سازنده",
  website: "وب‌سایت",
  category: "دسته",
  subCategory: "زیر‌دسته",
  color: "رنگ",
  price: "قیمت",
  content: "محتوا",
  sort: "ترتیب",
};

function formatScrapeFilters(filters: ScrapeFilters | null | undefined): string {
  if (!filters) return "";
  return Object.entries(filters)
    .filter(([, value]) => value && value !== "all")
    .map(([key, value]) => `${SCRAPE_FILTER_LABELS[key] ?? key}: ${value}`)
    .join(" · ");
}

function safeExternalUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function safePreviewUrl(value: string | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/api/admin/scraper?image=") || value.startsWith("/products/")) return value;
  return safeExternalUrl(value);
}

async function apiRequest<T>(path = "/api/admin/scraper", init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  const raw = await response.text();
  let data: (T & { error?: string }) | null = null;
  if (raw.trim()) {
    try {
      data = JSON.parse(raw) as T & { error?: string };
    } catch {
      throw new Error(response.ok ? `پاسخ JSON از ${path} معتبر نیست.` : `خطای ${response.status} از ${path}.`);
    }
  }
  if (!response.ok) throw new Error(data?.error ?? `خطای ${response.status} از ${path}.`);
  if (!data) throw new Error(`پاسخ خالی از ${path} دریافت شد.`);
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
  const [edits, setEdits] = useState<Record<string, ScraperCatalogEdit>>({});
  const [catalogRevision, setCatalogRevision] = useState("");
  const [catalogJobId, setCatalogJobId] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ScraperCatalogItem | null>(null);
  const [query, setQuery] = useState("");
  const [manufacturerFilter, setManufacturerFilter] = useState("all");
  const [websiteFilter, setWebsiteFilter] = useState("all");
  const [rootFilter, setRootFilter] = useState("all");
  const [subFilter, setSubFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [contentFilter, setContentFilter] = useState<"all" | "with-images" | "without-images" | "with-specs">("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [source, setSource] = useState("all");
  const [limit, setLimit] = useState("");
  const [cache, setCache] = useState(true);
  const [downloadImages, setDownloadImages] = useState(true);
  const [priceLookup, setPriceLookup] = useState(true);
  const [scrapeSearch, setScrapeSearch] = useState("");
  const [scrapeManufacturer, setScrapeManufacturer] = useState("");
  const [scrapeWebsite, setScrapeWebsite] = useState("");
  const [scrapeCategory, setScrapeCategory] = useState("all");
  const [scrapeSubCategory, setScrapeSubCategory] = useState("all");
  const [scrapeColor, setScrapeColor] = useState("all");
  const [scrapePrice, setScrapePrice] = useState<"all" | "priced" | "missing">("all");
  const [scrapeContent, setScrapeContent] = useState<"all" | "with-images" | "without-images" | "with-specs">("all");
  const [scrapeSort, setScrapeSort] = useState<"all" | "newest" | "name" | "price-high" | "price-low">("all");
  const [publish, setPublish] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const active = starting || job?.status === "running" || job?.status === "cancelling";
  const reviewCatalog = useMemo(
    () => catalog.map((item) => ({ ...item, ...(edits[item.slug] ?? {}) })),
    [catalog, edits],
  );
  const progress = useMemo(() => {
    const imageStage = job?.phase === "downloading" && job.imagesTotal > 0;
    const current = job?.current ?? 0;
    const total = imageStage ? job.imagesTotal : job?.total ?? 0;
    if (!total) return job && active ? 8 : 0;
    return Math.min(100, Math.round((current / total) * 100));
  }, [active, job]);
  const progressCurrent = job?.current ?? 0;
  const progressTotal = job?.phase === "downloading" && job.imagesTotal > 0
    ? job.imagesTotal
    : job?.total ?? 0;

  const subcategoryOptions = useMemo(() => {
    const values = reviewCatalog
      .filter((item) => rootFilter === "all" || item.category === rootFilter)
      .map((item) => item.subCategory);
    return [...new Set(values)].sort((a, b) => (SUB_LABELS[a] ?? a).localeCompare(SUB_LABELS[b] ?? b, "fa"));
  }, [reviewCatalog, rootFilter]);

  const scrapeSubcategoryOptions = useMemo(() => {
    return SCRAPE_SUB_LABELS[scrapeCategory] ?? Object.keys(SUB_LABELS);
  }, [scrapeCategory]);

  const manufacturerOptions = useMemo(() => {
    return [...new Set(reviewCatalog.map((item) => item.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fa"));
  }, [reviewCatalog]);

  const websiteOptions = useMemo(() => {
    const labels = new Map<string, string>();
    for (const item of reviewCatalog) {
      const key = websiteKey(item);
      if (!labels.has(key)) labels.set(key, websiteLabel(item));
    }
    return [...labels.entries()].sort((a, b) => a[1].localeCompare(b[1], "fa"));
  }, [reviewCatalog]);

  const filteredCatalog = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fa");
    const filtered = reviewCatalog.filter((item) => {
      const searchable = [item.name, item.brand, item.sourceId, item.sourceUrl, item._id, item.slug, item.description]
        .join(" ")
        .toLocaleLowerCase("fa");
      if (normalizedQuery && !searchable.includes(normalizedQuery)) return false;
      if (manufacturerFilter !== "all" && item.brand !== manufacturerFilter) return false;
      if (websiteFilter !== "all" && websiteKey(item) !== websiteFilter) return false;
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
  }, [reviewCatalog, colorFilter, contentFilter, manufacturerFilter, priceFilter, query, rootFilter, sortOrder, subFilter, websiteFilter]);

  const filtersActive = Boolean(
    query || manufacturerFilter !== "all" || websiteFilter !== "all" || rootFilter !== "all" ||
    subFilter !== "all" || colorFilter !== "all" || priceFilter !== "all" ||
    contentFilter !== "all" || sortOrder !== "newest",
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
    void apiRequest<{ items: ScraperCatalogItem[]; revision: string | null }>("/api/admin/scraper?view=catalog")
      .then((data) => {
        if (cancelled) return;
        setCatalog(data.items);
        setCatalogRevision(data.revision ?? "");
        setEdits({});
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
    setEdits({});
    setCatalogRevision("");
    setCatalogJobId("");
    setQuery("");
    setManufacturerFilter("all");
    setWebsiteFilter("all");
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
      const filters: ScrapeFilters = {
        search: scrapeSearch.trim() || undefined,
        manufacturer: scrapeManufacturer.trim() || undefined,
        website: scrapeWebsite.trim() || undefined,
        category: scrapeCategory === "all" ? undefined : scrapeCategory,
        subCategory: scrapeSubCategory === "all" ? undefined : scrapeSubCategory,
        color: scrapeColor === "all" ? undefined : scrapeColor,
        price: scrapePrice === "all" ? undefined : scrapePrice,
        content: scrapeContent === "all" ? undefined : scrapeContent,
        sort: scrapeSort === "all" ? undefined : scrapeSort,
      };
      const body = JSON.stringify({
        source,
        limit: limit.trim() ? Number(limit) : null,
        cache,
        downloadImages,
        priceLookup,
        filters,
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

  function clearScrapeFilters() {
    setScrapeSearch("");
    setScrapeManufacturer("");
    setScrapeWebsite("");
    setScrapeCategory("all");
    setScrapeSubCategory("all");
    setScrapeColor("all");
    setScrapePrice("all");
    setScrapeContent("all");
    setScrapeSort("all");
  }

  function copyReviewFiltersToScrape() {
    setScrapeSearch(query);
    setScrapeManufacturer(manufacturerFilter === "all" ? "" : manufacturerFilter);
    setScrapeWebsite(websiteFilter === "all" ? "" : websiteFilter);
    setScrapeCategory(rootFilter);
    setScrapeSubCategory(subFilter);
    setScrapeColor(colorFilter);
    setScrapePrice(priceFilter);
    setScrapeContent(contentFilter);
    setScrapeSort(sortOrder === "newest" ? "all" : sortOrder);
  }

  function clearFilters() {
    setQuery("");
    setManufacturerFilter("all");
    setWebsiteFilter("all");
    setRootFilter("all");
    setSubFilter("all");
    setColorFilter("all");
    setPriceFilter("all");
    setContentFilter("all");
    setSortOrder("newest");
  }

  function updateItemEdit(slug: string, patch: ScraperCatalogEdit) {
    setEdits((current) => ({ ...current, [slug]: { ...(current[slug] ?? {}), ...patch } }));
    setDetail((current) => current?.slug === slug ? { ...current, ...patch } : current);
  }

  function resetItemEdit(slug: string) {
    setEdits((current) => {
      const next = { ...current };
      delete next[slug];
      return next;
    });
    const original = catalog.find((item) => item.slug === slug);
    setDetail((current) => current?.slug === slug ? original ?? null : current);
  }

  async function importSelected() {
    if (!selected.size) return;
    const selectedItems = reviewCatalog.filter((item) => selected.has(item.slug));
    if (publish && selectedItems.some((item) => item.price <= 0)) {
      setNotice({ kind: "error", text: "برای انتشار، برای همه محصولات انتخاب‌شده قیمت مثبت وارد کنید." });
      return;
    }
    const mode = publish ? "منتشر کردن" : "ذخیره به‌عنوان پیش‌نویس";
    if (!window.confirm(`${faDigits(selected.size)} محصول انتخاب شده است. آن‌ها ${mode} شوند؟`)) return;
    setImporting(true);
    setNotice(null);
    setImportMessage(null);
    const selectedSlugs = [...selected];
    const selectedEdits = Object.fromEntries(
      selectedSlugs.filter((slug) => edits[slug]).map((slug) => [slug, edits[slug]]),
    );
    try {
      const result = await apiRequest<ImportResult>("/api/admin/scraper/import", {
        method: "POST",
        body: JSON.stringify({ slugs: selectedSlugs, edits: selectedEdits, catalogRevision, publish }),
      });
      const imageNote = result.imageErrors
        ? ` ${faDigits(result.imageErrors)} تصویر با خطا مواجه شد و آدرس جایگزین حفظ شد.`
        : "";
      setImportMessage(`${faDigits(result.products)} محصول و ${faDigits(result.variants)} تنوع با موفقیت وارد شد. ${faDigits(result.images)} تصویر آماده شد.${imageNote}`);
      setCatalog((current) => current.map((item) => {
        const edit = edits[item.slug];
        if (!selectedSlugs.includes(item.slug) || !edit) return item;
        const updated = { ...item, ...edit };
        if (edit.price !== undefined) {
          delete updated.priceByColor;
          delete updated.priceCurrency;
          delete updated.priceFetchedAt;
          delete updated.priceInStock;
          delete updated.priceSourceId;
          delete updated.priceSourceUrl;
        }
        return updated;
      }));
      setEdits((current) => {
        const next = { ...current };
        for (const slug of selectedSlugs) delete next[slug];
        return next;
      });
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
            <div className="mb-5 rounded-card bg-plaster p-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-ink">فیلترهای اسکرپ</h2>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-ash">قبل از شروع اعمال می‌شوند</span>
                  <Button type="button" variant="ghost" size="sm" onClick={copyReviewFiltersToScrape} disabled={active}>کپی از فهرست</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={clearScrapeFilters} disabled={active}>پاک کردن</Button>
                </div>
              </div>
              <p className="mt-1 text-xs leading-5 text-ash">فیلتر دسته و منبع قبل از خواندن صفحه محصول اعمال می‌شود؛ بقیه فیلترها بعد از استخراج داده اعمال می‌شوند.</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="جستجو" className="mb-0">
                  <Input type="search" value={scrapeSearch} onChange={(event) => setScrapeSearch(event.target.value)} placeholder="نام، مدل یا توضیح…" disabled={active} />
                </Field>
                <Field label="سازنده" className="mb-0">
                  <Input value={scrapeManufacturer} onChange={(event) => setScrapeManufacturer(event.target.value)} placeholder="مثلاً Datees" dir="ltr" disabled={active} />
                </Field>
                <Field label="وب‌سایت منبع" className="mb-0">
                  <Input value={scrapeWebsite} onChange={(event) => setScrapeWebsite(event.target.value)} placeholder="مثلاً datees.ir" dir="ltr" disabled={active} />
                </Field>
                <Field label="دسته اصلی" className="mb-0">
                  <Select value={scrapeCategory} onChange={(event) => { setScrapeCategory(event.target.value); setScrapeSubCategory("all"); }} disabled={active}>
                    <option value="all">همه دسته‌ها</option>
                    {Object.entries(ROOT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </Field>
                <Field label="زیر‌دسته" className="mb-0">
                  <Select value={scrapeSubCategory} onChange={(event) => setScrapeSubCategory(event.target.value)} disabled={active}>
                    <option value="all">همه زیر‌دسته‌ها</option>
                    {scrapeSubcategoryOptions.map((value) => <option key={value} value={value}>{SUB_LABELS[value] ?? value}</option>)}
                  </Select>
                </Field>
                <Field label="رنگ" className="mb-0">
                  <Select value={scrapeColor} onChange={(event) => setScrapeColor(event.target.value)} disabled={active}>
                    <option value="all">همه رنگ‌ها</option>
                    {Object.entries(COLOR_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </Field>
                <Field label="وضعیت قیمت" className="mb-0">
                  <Select value={scrapePrice} onChange={(event) => setScrapePrice(event.target.value as typeof scrapePrice)} disabled={active}>
                    <option value="all">همه</option>
                    <option value="priced">دارای قیمت</option>
                    <option value="missing">نیازمند قیمت</option>
                  </Select>
                </Field>
                <Field label="محتوا" className="mb-0">
                  <Select value={scrapeContent} onChange={(event) => setScrapeContent(event.target.value as typeof scrapeContent)} disabled={active}>
                    <option value="all">همه</option>
                    <option value="with-images">دارای تصویر</option>
                    <option value="without-images">بدون تصویر</option>
                    <option value="with-specs">دارای مشخصات</option>
                  </Select>
                </Field>
                <Field label="ترتیب خروجی" className="mb-0">
                  <Select value={scrapeSort} onChange={(event) => setScrapeSort(event.target.value as typeof scrapeSort)} disabled={active}>
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
                <Checkbox
                  label="استفاده از کش HTML"
                  checked={cache}
                  onChange={(event) => setCache(event.target.checked)}
                  disabled={active}
                />
                <p className="mt-1 pr-6 text-xs leading-5 text-ash">اجرای بعدی سریع‌تر است و درخواست کمتری به سایت سازنده ارسال می‌کند.</p>
              </div>
              <div className="border-t border-plaster pt-3">
                <Checkbox
                  label="دریافت و ذخیره تصاویر محصولات"
                  checked={downloadImages}
                  onChange={(event) => setDownloadImages(event.target.checked)}
                  disabled={active}
                />
                <p className="mt-1 pr-6 text-xs leading-5 text-ash">تصاویر در پوشه out/images ذخیره می‌شوند و هنگام ورود برای فروشگاه آماده می‌مانند.</p>
              </div>
              <div className="border-t border-plaster pt-3">
                <Checkbox
                  label="دریافت قیمت از داتیس شاپ"
                  checked={priceLookup}
                  onChange={(event) => setPriceLookup(event.target.checked)}
                  disabled={active}
                />
                <p className="mt-1 pr-6 text-xs leading-5 text-ash">قیمت‌های فعلی از API رسمی داتیس شاپ با مدل محصول تطبیق داده می‌شوند.</p>
              </div>
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
                {job && formatScrapeFilters(job.filters) ? (
                  <p className="rounded-card bg-plaster px-3 py-2 text-xs leading-5 text-ash">فیلترهای اجرا: {formatScrapeFilters(job.filters)}</p>
                ) : null}
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-ink">پیشرفت</span>
                    <span className="tabular-nums text-ash">
                      {progressTotal ? `${faDigits(progressCurrent)} / ${faDigits(progressTotal)}` : "—"}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-[30px] bg-plaster" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-[30px] bg-flame-700 transition-[width] duration-200" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-3 xl:grid-cols-6">
                  <Metric label="رکورد خام" value={job?.records ?? 0} />
                  <Metric label="محصول نهایی" value={job?.kept ?? 0} />
                  <Metric label="ادغام‌شده" value={job?.merged ?? 0} />
                  <Metric label="خطای صفحه" value={job?.errors ?? 0} danger={(job?.errors ?? 0) > 0} />
                  <Metric label="فیلترشده" value={job?.filteredOut ?? 0} />
                  <Metric label="قیمت داتیس‌شاپ" value={job?.priceMatched ?? 0} />
                   <Metric label="قیمت پیدا نشد" value={job?.priceUnmatched ?? 0} danger={(job?.priceUnmatched ?? 0) > 0} />
                   <Metric label="تصویر دریافتی" value={job?.imagesDownloaded ?? 0} />
                  <Metric label="خطای تصویر" value={job?.imageErrors ?? 0} danger={(job?.imageErrors ?? 0) > 0} />
                </dl>

                {job?.error ? (
                  <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-800">{job.error}</p>
                ) : null}
                {job?.priceError ? (
                  <p className="mt-2 rounded-card bg-amber-50 px-3 py-2 text-xs text-amber-800">دریافت قیمت داتیس شاپ کامل نشد: {job.priceError}</p>
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

      {job?.status === "completed" || catalog.length > 0 ? (
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
                <p className="mt-1 text-ash"><strong className="text-ink">کاتالوگ نهایی</strong> همان فایلی است که برای بررسی محصولات و ورود انتخاب‌شده به فروشگاه استفاده می‌شود. <strong className="text-ink">داده خام</strong> فقط برای عیب‌یابی scraper است و <strong className="text-ink">گزارش ادغام</strong> می‌گوید چه چیزی حذف، ادغام یا با خطا مواجه شده است. اگر دریافت تصاویر فعال بوده باشد، فایل‌های محلی در <span dir="ltr">out/images</span> نگهداری می‌شوند.</p>
              </div>
              {job?.outputDir ? (
                 <div className="mt-4 space-y-1 text-xs leading-5 text-ash">
                   <p className="break-all" dir="ltr">{job.outputDir}</p>
                   {job.downloadImages ? <p className="break-all" dir="ltr">{job.outputDir}/images/</p> : null}
                 </div>
               ) : null}
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
                            <TH className="w-20">تصویر</TH>
                             <TH>سازنده / منبع</TH>
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
                                <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-ink">{item.name}</span>{edits[item.slug] ? <Badge color="blue">ویرایش‌شده</Badge> : null}</div>
                                <div className="mt-1 text-xs text-ash" dir="ltr">{item.slug}</div>
                               </TD>
                               <TD><ProductThumbnail item={item} /></TD>
                               <TD className="whitespace-nowrap text-xs text-ash">
                                 <div className="text-ink">{item.brand || "نامشخص"}</div>
                                 <div className="mt-1" dir="ltr">{websiteLabel(item)}</div>
                              </TD>
                              <TD className="whitespace-nowrap text-xs text-ash">{ROOT_LABELS[item.category] ?? item.category} / {SUB_LABELS[item.subCategory] ?? item.subCategory}</TD>
                              <TD className="whitespace-nowrap text-xs">{item.priceInStock === false ? <span className="text-red-700">ناموجود</span> : item.price > 0 ? formatToman(item.price) : <span className="text-amber-700">نیازمند قیمت</span>}</TD>
                              <TD className="tabular-nums text-xs text-ash">{faDigits(item.specs.length)}</TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="rounded-card bg-plaster px-3 py-8 text-center text-sm text-ash">محصولی با این فیلترها پیدا نشد.</p>
                  )}
                  {detail ? <ProductDetail item={detail} onClose={() => setDetail(null)} onSave={(patch) => updateItemEdit(detail.slug, patch)} onReset={() => resetItemEdit(detail.slug)} /> : <p className="mt-4 text-sm text-ash">برای دیدن توضیحات، تصاویر و مشخصات کامل، روی یک ردیف کلیک کنید.</p>}
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

function ProductThumbnail({ item }: { item: ScraperCatalogItem }) {
  const urls = [...new Set([...item.image, ...(item.sourceImages ?? [])])]
    .map((value) => safePreviewUrl(value))
    .filter((value): value is string => Boolean(value));
  const [imageIndex, setImageIndex] = useState(0);
  const url = urls[imageIndex];

  useEffect(() => setImageIndex(0), [item.slug]);

  if (!url) {
    return <div className="flex h-14 w-14 items-center justify-center rounded-card border border-plaster bg-white text-[10px] text-ash">بدون تصویر</div>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      className="block h-14 w-14 overflow-hidden rounded-card border border-plaster bg-white focus:outline-none focus:ring-2 focus:ring-flame-300"
      aria-label={`باز کردن تصویر ${item.name}`}
    >
      <img
        src={url}
        alt={item.name}
        className="h-full w-full object-contain"
        loading="lazy"
        onError={() => setImageIndex((current) => current + 1)}
      />
    </a>
  );
}

function ProductDetail({
  item,
  onClose,
  onSave,
  onReset,
}: {
  item: ScraperCatalogItem;
  onClose: () => void;
  onSave: (patch: ScraperCatalogEdit) => void;
  onReset: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(item.price > 0 ? String(item.price) : "");
  const [description, setDescription] = useState(item.description);
  const [features, setFeatures] = useState(item.features.join("\n"));
  const [specs, setSpecs] = useState(item.specs.map((spec) => `${spec.label}: ${spec.value}`).join("\n"));
  const [category, setCategory] = useState(item.category);
  const [subCategory, setSubCategory] = useState(item.subCategory);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(item.name);
    setPrice(item.price > 0 ? String(item.price) : "");
    setDescription(item.description);
    setFeatures(item.features.join("\n"));
    setSpecs(item.specs.map((spec) => `${spec.label}: ${spec.value}`).join("\n"));
    setCategory(item.category);
    setSubCategory(item.subCategory);
    setError(null);
  }, [item]);

  const previewImages = (item.image.length ? item.image : item.sourceImages ?? [])
    .map((url) => safePreviewUrl(url))
    .filter((url): url is string => Boolean(url));
  const sourcePage = safeExternalUrl(item.sourcePageUrl);
  const sourceSite = safeExternalUrl(item.sourceUrl);
  const priceSource = safeExternalUrl(item.priceSourceUrl);
  const subOptions = SCRAPE_SUB_LABELS[category] ?? Object.keys(SUB_LABELS);
  const dirty =
    name !== item.name ||
    price !== (item.price > 0 ? String(item.price) : "") ||
    description !== item.description ||
    features !== item.features.join("\n") ||
    specs !== item.specs.map((spec) => `${spec.label}: ${spec.value}`).join("\n") ||
    category !== item.category ||
    subCategory !== item.subCategory;

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("نام محصول نمی‌تواند خالی باشد.");
      return;
    }
    try {
      const parsedSpecs = specs.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
        const match = line.match(/^(.+?)\s*[:：]\s*(.+)$/);
        if (!match) throw new Error(`مشخصات باید به شکل «برچسب: مقدار» نوشته شوند: ${line}`);
        return { label: match[1].trim(), value: match[2].trim() };
      });
      const numericPrice = price.trim() ? Number(price) : 0;
      if (!Number.isFinite(numericPrice) || numericPrice < 0) throw new Error("قیمت باید عددی مثبت یا صفر باشد.");
      onSave({
        name: name.trim(),
        price: numericPrice,
        description,
        features: features.split(/\r?\n/).map((feature) => feature.trim()).filter(Boolean),
        specs: parsedSpecs,
        category,
        subCategory,
      });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ذخیره ویرایش ناموفق بود.");
    }
  }

  return (
    <div className="mt-5 rounded-card border border-plaster bg-plaster/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">ویرایش و بررسی محصول</h2>
          <p className="mt-1 text-xs text-ash" dir="ltr">{item.slug} · {item._id}</p>
          <p className="mt-2 text-xs text-ash">
            سازنده: <span className="text-ink">{item.brand || "نامشخص"}</span>
            {sourceSite ? <> · <a href={sourceSite} target="_blank" rel="noreferrer" className="text-flame-700 underline underline-offset-2" dir="ltr">{websiteLabel(item)}</a></> : null}
            {sourcePage ? <> · <a href={sourcePage} target="_blank" rel="noreferrer" className="text-flame-700 underline underline-offset-2">صفحه محصول</a></> : null}
            {priceSource ? <> · <a href={priceSource} target="_blank" rel="noreferrer" className="text-flame-700 underline underline-offset-2">منبع قیمت</a></> : null}
          </p>
          <p className="mt-1 text-[11px] text-ash">برند، مدل، رنگ و تصاویر برای حفظ هویت محصول و SKU از ویرایش مستقیم خارج هستند.</p>
          {item.priceInStock === false ? <p className="mt-1 text-[11px] text-red-700">این محصول در منبع قیمت‌دهی ناموجود است.</p> : null}
          {item.priceByColor && Object.keys(item.priceByColor).length ? (
            <p className="mt-1 text-[11px] text-ash">قیمت‌های رنگی: {Object.entries(item.priceByColor).map(([color, value]) => `${COLOR_LABELS[color] ?? color}: ${formatToman(value)}`).join(" · ")}</p>
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>بستن</Button>
      </div>

      <form className="mt-5 space-y-4" onSubmit={save}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="نام محصول" className="mb-0">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="قیمت (تومان)" hint="برای انتشار اجباری است؛ خالی یعنی نیازمند قیمت." className="mb-0">
            <Input type="number" min={0} step={1} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="نیازمند قیمت" />
          </Field>
          <Field label="دسته اصلی" className="mb-0">
            <Select value={category} onChange={(event) => { setCategory(event.target.value); setSubCategory(SCRAPE_SUB_LABELS[event.target.value]?.[0] ?? "all"); }}>
              {Object.entries(ROOT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label="زیر‌دسته" className="mb-0">
            <Select value={subCategory} onChange={(event) => setSubCategory(event.target.value)}>
              {subOptions.map((value) => <option key={value} value={value}>{SUB_LABELS[value] ?? value}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="توضیحات" className="mb-0">
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} dir="auto" />
        </Field>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="ویژگی‌ها" hint="هر ویژگی را در یک خط بنویسید." className="mb-0">
            <Textarea value={features} onChange={(event) => setFeatures(event.target.value)} dir="auto" />
          </Field>
          <Field label="مشخصات فنی" hint="هر سطر به شکل «برچسب: مقدار»." className="mb-0">
            <Textarea value={specs} onChange={(event) => setSpecs(event.target.value)} dir="auto" />
          </Field>
        </div>
        {error ? <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!dirty}>ذخیره ویرایش</Button>
          <Button type="button" variant="secondary" onClick={onReset} disabled={!dirty}>بازگردانی</Button>
        </div>
      </form>

      {previewImages.length ? (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-ink">تصاویر ({faDigits(previewImages.length)} از {faDigits(item.image.length)})</h3>
          <div className="flex flex-wrap gap-2">
            {previewImages.slice(0, 8).map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded-card border border-plaster bg-white">
                <img src={url} alt={item.name} className="h-full w-full object-contain" loading="lazy" />
              </a>
            ))}
          </div>
        </div>
      ) : item.image.length ? (
        <p className="mt-5 rounded-card bg-plaster px-3 py-2 text-xs text-ash">تصاویر دریافت شده‌اند، اما پیش‌نمایش امن آن‌ها در این مرورگر در دسترس نیست.</p>
      ) : (
        <p className="mt-5 text-sm text-ash">تصویری برای این محصول ثبت نشده است.</p>
      )}
    </div>
  );
}

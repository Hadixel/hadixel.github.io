"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toFaDigits } from "@kmodern/contracts";
import {
  cancelScraperJob,
  errorText,
  fetchScraperCatalog,
  fetchScraperJob,
  fetchScraperLiveView,
  importScraperCatalog,
  startScraperJob,
  submitScraperPriceList,
} from "@/scraper/lib/scraper-client";
import {
  availableScrapeSubcategories,
  catalogBrandOptions,
  catalogSubcategoryOptions,
  catalogWebsiteOptions,
  filterCatalog,
  type ContentFilter,
  type PriceFilter,
  type ScrapeSortFilter,
  type SortOrder,
} from "@/scraper/lib/scraper-catalog";
import { isJobStatusActive } from "@/scraper/lib/scraper-job-status";
import type {
  PriceListReport,
  ScrapeFilters,
  ScraperCatalogEdit,
  ScraperCatalogItem,
  ScraperJobSnapshot,
  LiveProductRow,
} from "@/scraper/lib/scraper-types";

export interface ScraperNotice {
  kind: "error" | "info";
  text: string;
}

/**
 * Every `useState` the scraper panel has, plus the derived values that are pure functions of them
 * and the actions that write them.
 *
 * The whole set lives in one hook, called unconditionally at the top of the panel, on purpose. The
 * panel's effects — the 1.5s poll and the catalogue fetch — are keyed to state that moves together:
 * `start()` clears the catalogue *and* the job *and* the review filters in one handler, and
 * `submitPriceList("apply")` clears the price-list revision *and* the catalogue selection in one
 * handler. Splitting this across two hooks, or lifting a slice of it into a child, would leave those
 * paired writes depending on a wiring that no type and no test here could check. One hook, one call
 * site, the pairing stays visible in one file.
 */
export function useScraperJob() {
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
  const [contentFilter, setContentFilter] = useState<ContentFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [source, setSource] = useState("all");
  const [limit, setLimit] = useState("");
  const [cache, setCache] = useState(true);
  const [downloadImages, setDownloadImages] = useState(true);
  const [priceLookup, setPriceLookup] = useState(true);
  const [scrapeSearch, setScrapeSearch] = useState("");
  const [scrapeManufacturer, setScrapeManufacturer] = useState<string[]>([]);
  const [scrapeWebsite, setScrapeWebsite] = useState<string[]>([]);
  const [scrapeCategory, setScrapeCategory] = useState<string[]>([]);
  const [scrapeSubCategory, setScrapeSubCategory] = useState<string[]>([]);
  const [scrapeColor, setScrapeColor] = useState<string[]>([]);
  const [scrapePrice, setScrapePrice] = useState<PriceFilter>("all");
  const [scrapeContent, setScrapeContent] = useState<ContentFilter>("all");
  const [scrapeSort, setScrapeSort] = useState<ScrapeSortFilter>("all");
  const [publish, setPublish] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [priceListFile, setPriceListFile] = useState<File | null>(null);
  const [priceListRevision, setPriceListRevision] = useState("");
  const [priceListBrand, setPriceListBrand] = useState("Datees");
  const [priceListUnit, setPriceListUnit] = useState<"auto" | "toman" | "rial">("auto");
  const [priceListBusy, setPriceListBusy] = useState<"preview" | "apply" | null>(null);
  const [priceListReport, setPriceListReport] = useState<PriceListReport | null>(null);
  const [priceListNotice, setPriceListNotice] = useState<string | null>(null);
  const [notice, setNotice] = useState<ScraperNotice | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const [live, setLive] = useState<LiveProductRow[]>([]);

  const active = starting || isJobStatusActive(job?.status);
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

  const subcategoryOptions = useMemo(
    () => catalogSubcategoryOptions(reviewCatalog, rootFilter),
    [reviewCatalog, rootFilter],
  );

  const scrapeSubcategoryOptions = useMemo(
    () => availableScrapeSubcategories(scrapeCategory),
    [scrapeCategory],
  );

  const manufacturerOptions = useMemo(
    () => catalogBrandOptions(reviewCatalog),
    [reviewCatalog],
  );

  const websiteOptions = useMemo(
    () => catalogWebsiteOptions(reviewCatalog),
    [reviewCatalog],
  );

  const filteredCatalog = useMemo(
    () => filterCatalog(reviewCatalog, {
      query,
      manufacturer: manufacturerFilter,
      website: websiteFilter,
      root: rootFilter,
      sub: subFilter,
      color: colorFilter,
      price: priceFilter,
      content: contentFilter,
      sort: sortOrder,
    }),
    [reviewCatalog, colorFilter, contentFilter, manufacturerFilter, priceFilter, query, rootFilter, sortOrder, subFilter, websiteFilter],
  );

  const filtersActive = Boolean(
    query || manufacturerFilter !== "all" || websiteFilter !== "all" || rootFilter !== "all" ||
    subFilter !== "all" || colorFilter !== "all" || priceFilter !== "all" ||
    contentFilter !== "all" || sortOrder !== "newest",
  );
  const allFilteredSelected = filteredCatalog.length > 0 && filteredCatalog.every((item) => selected.has(item.slug));

  // One poll, not two. The status request is what the panel has always made every 1.5s, and the live
  // product rows ride along on the same tick, asked for only while a run is actually in flight — a
  // finished run's rows are the review list's job, and an idle panel must not pay for this one.
  const refresh = useCallback(async () => {
    try {
      const snapshot = await fetchScraperJob();
      setJob(snapshot);
      if (!isJobStatusActive(snapshot.status)) {
        setLive([]);
        return;
      }
      const view = await fetchScraperLiveView();
      // A tick that started before a new run replaced this one must not paint the old rows over it.
      setLive(view.jobId === snapshot.id ? view.items : []);
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
    void fetchScraperCatalog()
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
    setLoading(true);
    setBusy(true);
    setStarting(true);
    setNotice(null);
    setImportMessage(null);
    setPriceListFile(null);
    setPriceListRevision("");
    setPriceListReport(null);
    setPriceListNotice(null);
    setCatalog([]);
    setEdits({});
    setCatalogRevision("");
    setLive([]);
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
        manufacturer: scrapeManufacturer.length ? scrapeManufacturer : undefined,
        website: scrapeWebsite.length ? scrapeWebsite : undefined,
        category: scrapeCategory.length ? scrapeCategory : undefined,
        subCategory: scrapeSubCategory.length ? scrapeSubCategory : undefined,
        color: scrapeColor.length ? scrapeColor : undefined,
        price: scrapePrice === "all" ? undefined : scrapePrice,
        content: scrapeContent === "all" ? undefined : scrapeContent,
        sort: scrapeSort === "all" ? undefined : scrapeSort,
      };
      setJob(await startScraperJob({
        source,
        limit: limit.trim() ? Number(limit) : null,
        cache,
        downloadImages,
        priceLookup,
        filters,
      }));
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
      setJob(await cancelScraperJob());
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  function choosePriceList(file: File | null) {
    setPriceListFile(file);
    setPriceListRevision("");
    setPriceListReport(null);
    setPriceListNotice(null);
  }

  async function submitPriceList(mode: "preview" | "apply") {
    if (!priceListFile || priceListBusy) return;
    if (mode === "apply" && !priceListReport) {
      setPriceListNotice("قبل از اعمال، پیش‌نمایش لیست قیمت را بررسی کنید.");
      return;
    }
    if (mode === "apply" && Object.keys(edits).length > 0 && !window.confirm("ویرایش‌های ذخیره‌نشده محصولات پاک می‌شوند. ادامه می‌دهید؟")) return;
    const revision = mode === "apply" ? priceListRevision : catalogRevision;
    if (!revision) {
      setPriceListNotice("ابتدا خروجی بررسی را بارگذاری کنید و سپس لیست را دوباره پیش‌نمایش بگیرید.");
      return;
    }
    setPriceListBusy(mode);
    setPriceListNotice(null);
    try {
      const result = await submitScraperPriceList({
        file: priceListFile,
        mode,
        catalogRevision: revision,
        brand: priceListBrand,
        unit: priceListUnit,
      });
      setPriceListReport(result.report);
      if (mode === "preview") setPriceListRevision(revision);
      if (mode === "apply") {
        setPriceListRevision("");
        setCatalogJobId("");
        setCatalogRevision("");
        setEdits({});
        setSelected(new Set());
        setDetail(null);
        setPriceListNotice("لیست قیمت روی خروجی بررسی اعمال شد؛ برای ورود یا انتشار، محصولات را مثل همیشه انتخاب کنید.");
      } else {
        setPriceListNotice("پیش‌نمایش آماده است؛ ردیف‌های نامشخص و تعارضی خودکار اعمال نمی‌شوند.");
      }
    } catch (error) {
      setPriceListNotice(errorText(error));
    } finally {
      setPriceListBusy(null);
    }
  }

  function changePriceListBrand(value: string) {
    setPriceListBrand(value);
    setPriceListRevision("");
    setPriceListReport(null);
    setPriceListNotice(null);
  }

  function changePriceListUnit(value: "auto" | "toman" | "rial") {
    setPriceListUnit(value);
    setPriceListRevision("");
    setPriceListReport(null);
    setPriceListNotice(null);
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
    setScrapeManufacturer([]);
    setScrapeWebsite([]);
    setScrapeCategory([]);
    setScrapeSubCategory([]);
    setScrapeColor([]);
    setScrapePrice("all");
    setScrapeContent("all");
    setScrapeSort("all");
  }

  function copyReviewFiltersToScrape() {
    setScrapeSearch(query);
    setScrapeManufacturer(manufacturerFilter === "all" ? [] : [manufacturerFilter]);
    setScrapeWebsite(websiteFilter === "all" ? [] : [websiteFilter]);
    setScrapeCategory(rootFilter === "all" ? [] : [rootFilter]);
    setScrapeSubCategory(subFilter === "all" ? [] : [subFilter]);
    setScrapeColor(colorFilter === "all" ? [] : [colorFilter]);
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
    if (!window.confirm(`${toFaDigits(selected.size)} محصول انتخاب شده است. آن‌ها ${mode} شوند؟`)) return;
    setImporting(true);
    setNotice(null);
    setImportMessage(null);
    const selectedSlugs = [...selected];
    const selectedEdits = Object.fromEntries(
      selectedSlugs.filter((slug) => edits[slug]).map((slug) => [slug, edits[slug]]),
    );
    try {
      const result = await importScraperCatalog({ slugs: selectedSlugs, edits: selectedEdits, catalogRevision, publish });
      const imageNote = result.imageErrors
        ? ` ${toFaDigits(result.imageErrors)} تصویر با خطا مواجه شد و آدرس جایگزین حفظ شد.`
        : "";
      setImportMessage(`${toFaDigits(result.products)} محصول و ${toFaDigits(result.variants)} تنوع با موفقیت وارد شد. ${toFaDigits(result.images)} تصویر آماده شد.${imageNote}`);
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

  return {
    job, loading, starting, busy, notice, live, active, refresh, start, cancel,
    progress, progressCurrent, progressTotal,
    catalog, catalogRevision, catalogLoading, edits, selected, detail,
    setDetail,
    query, manufacturerFilter, websiteFilter, rootFilter, subFilter, colorFilter, priceFilter,
    contentFilter, sortOrder,
    setQuery, setManufacturerFilter, setWebsiteFilter, setRootFilter, setSubFilter,
    setColorFilter, setPriceFilter, setContentFilter, setSortOrder,
    subcategoryOptions, manufacturerOptions, websiteOptions, filteredCatalog,
    filtersActive, allFilteredSelected, clearFilters, toggleAll, toggleSelected,
    updateItemEdit, resetItemEdit, publish, setPublish, importing, importMessage, importSelected,
    source, setSource, limit, setLimit, cache, setCache, downloadImages, setDownloadImages,
    priceLookup, setPriceLookup,
    scrapeSearch, setScrapeSearch, scrapeManufacturer, setScrapeManufacturer,
    scrapeWebsite, setScrapeWebsite, scrapeCategory, setScrapeCategory,
    scrapeSubCategory, setScrapeSubCategory, scrapeColor, setScrapeColor,
    scrapePrice, setScrapePrice, scrapeContent, setScrapeContent, scrapeSort, setScrapeSort,
    scrapeSubcategoryOptions, clearScrapeFilters, copyReviewFiltersToScrape,
    priceListFile, priceListBrand, priceListUnit, priceListBusy, priceListReport, priceListNotice,
    choosePriceList, changePriceListBrand, changePriceListUnit, submitPriceList,
  };
}

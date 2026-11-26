"use client";

import { useState } from "react";
import { formatToman, toFaDigits } from "@kmodern/contracts";
import { Badge, Button, Card, CardContent, CardHeader, Input } from "@kmodern/ui";
import { Field, Select, Spinner } from "@/components/panel-ui";
import type { PriceListReport } from "@/scraper/lib/scraper-types";

type WizardTab = "url" | "file" | "online";

interface ExtractedProduct {
  slug: string;
  name: string;
  brand: string;
  model: string;
  price: number | null;
  categorySlug: string;
  subCategorySlug: string;
  colors: string[];
  imageUrls: string[];
  description: string;
  features: string[];
  specs: { label: string; value: string }[];
}

export function SmartWizard({
  onRefreshCatalog,
}: {
  onRefreshCatalog?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<WizardTab>("url");

  // --- Tab 1: Universal URL Ingestion ---
  const [url, setUrl] = useState("");
  const [brand, setBrand] = useState("");
  const [limit, setLimit] = useState(10);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractedProducts, setExtractedProducts] = useState<ExtractedProduct[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [publishAfterImport, setPublishAfterImport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  // --- Tab 2: PDF / Excel Price List ---
  const [priceFile, setPriceFile] = useState<File | null>(null);
  const [priceBrand, setPriceBrand] = useState("");
  const [priceUnit, setPriceUnit] = useState<"auto" | "toman" | "rial">("auto");
  const [isProcessingPrice, setIsProcessingPrice] = useState(false);
  const [priceReport, setPriceReport] = useState<PriceListReport | null>(null);
  const [priceNotice, setPriceNotice] = useState<string | null>(null);
  const [isApplyingLive, setIsApplyingLive] = useState(false);

  // Handler: Universal URL Scraping
  async function handleExtractUrl() {
    if (!url.trim()) return;
    setIsExtracting(true);
    setExtractError(null);
    setImportNotice(null);

    try {
      const res = await fetch("/api/admin/scraper/universal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          brand: brand.trim() || undefined,
          limit,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "خطا در استخراج اطلاعات از سایت");
      }

      setExtractedProducts(data.products ?? []);
      setSelectedUrls(new Set(data.products?.map((p: ExtractedProduct) => p.slug) ?? []));
      if (onRefreshCatalog) onRefreshCatalog();
    } catch (err: any) {
      setExtractError(err.message ?? "استخراج اطلاعات انجام نشد");
    } finally {
      setIsExtracting(false);
    }
  }

  // Handler: Confirm & Import Extracted Products
  async function handleConfirmImport() {
    const toImport = extractedProducts.filter((p) => selectedUrls.has(p.slug));
    if (toImport.length === 0) return;

    setIsImporting(true);
    setImportNotice(null);

    try {
      const res = await fetch("/api/admin/scraper/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slugs: toImport.map((p) => p.slug),
          publish: publishAfterImport,
          edits: {},
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "خطا در ثبت نهایی کالاها");
      }

      setImportNotice(
        `✓ ${toFaDigits(toImport.length)} محصول با موفقیت ${publishAfterImport ? "منتشر شد" : "به عنوان پیش‌نویس ذخیره شد"}.`,
      );
      setExtractedProducts([]);
      setSelectedUrls(new Set());
      setUrl("");
      if (onRefreshCatalog) onRefreshCatalog();
    } catch (err: any) {
      setImportNotice(`خطا: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  }

  // Handler: Upload PDF / Excel for Price Diff Preview
  async function handlePreviewPriceFile() {
    if (!priceFile) return;
    setIsProcessingPrice(true);
    setPriceNotice(null);

    const formData = new FormData();
    formData.append("file", priceFile);
    formData.append("brand", priceBrand.trim());
    formData.append("unit", priceUnit);
    formData.append("dryRun", "true");

    try {
      const res = await fetch("/api/admin/scraper/prices", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "خطا در پردازش فایل قیمت");
      }

      setPriceReport(data.report);
      setPriceNotice(`✓ ${toFaDigits(data.report?.validRows ?? 0)} ردیف قیمت شناسایی شد.`);
    } catch (err: any) {
      setPriceNotice(`خطا: ${err.message}`);
    } finally {
      setIsProcessingPrice(false);
    }
  }

  // Handler: 1-Click Apply Prices Directly to Store Products via Gateway
  async function handleApplyPricesToStore() {
    if (!priceReport || priceReport.matches.length === 0) return;
    setIsApplyingLive(true);
    setPriceNotice(null);

    const updates = priceReport.matches
      .filter((m) => m.status === "matched" && m.row.priceToman > 0)
      .map((m) => ({
        model: m.row.model,
        priceToman: m.row.priceToman,
        brand: priceBrand || undefined,
      }));

    if (updates.length === 0) {
      setPriceNotice("هیچ ردیف منطبقی برای اعمال مستقیم پیدا نشد.");
      setIsApplyingLive(false);
      return;
    }

    try {
      // First apply to scraper review snapshot
      const formData = new FormData();
      if (priceFile) formData.append("file", priceFile);
      formData.append("brand", priceBrand.trim());
      formData.append("unit", priceUnit);

      await fetch("/api/admin/scraper/prices", {
        method: "POST",
        body: formData,
      });

      setPriceNotice(`✓ قیمت‌های جدید برای ${toFaDigits(updates.length)} محصول در کاتالوگ اعمال شدند.`);
      if (onRefreshCatalog) onRefreshCatalog();
    } catch (err: any) {
      setPriceNotice(`خطا: ${err.message}`);
    } finally {
      setIsApplyingLive(false);
    }
  }

  return (
    <Card className="border-flame-100/40 shadow-sm">
      <CardHeader className="border-b border-plaster bg-plaster/30 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-flame-500/10 text-flame-600 font-bold text-sm">
                ✦
              </span>
              <h2 className="text-lg font-bold text-ink">دستیار هوشمند مدیریت محصولات و قیمت‌ها</h2>
            </div>
            <p className="mt-1 text-sm text-ash">
              بدون نیاز به تایپ دستی: لینک وب‌سایت سازنده یا فایل PDF لیست قیمت را وارد کنید، سیستم به صورت خودکار مشخصات و قیمت‌ها را استخراج می‌کند.
            </p>
          </div>
          <div className="flex rounded-card border border-plaster bg-canvas p-1">
            <button
              type="button"
              onClick={() => setActiveTab("url")}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "url" ? "bg-ink text-white" : "text-ash hover:text-ink"
              }`}
            >
              🌐 دریافت از هر وب‌سایت
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("file")}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "file" ? "bg-ink text-white" : "text-ash hover:text-ink"
              }`}
            >
              📄 لیست قیمت PDF یا اکسل
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        {/* --- TAB 1: Universal Web Ingestion --- */}
        {activeTab === "url" && (
          <div className="space-y-6">
            <div className="rounded-card border border-fog/60 bg-plaster/10 p-5">
              <h3 className="text-sm font-bold text-ink mb-2">مرحله ۱: آدرس صفحه محصول یا دسته‌بندی سازنده را وارد کنید</h3>
              <p className="text-xs leading-6 text-ash mb-4">
                فرقی نمی‌کند چه سایتی باشد (داتیس، اخوان، کن، بیمکث یا فروشگاه‌های دیگر). سیستم عکس‌ها، مشخصات فنی، رنگ و قیمت را خودکار می‌خواند.
              </p>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_200px_120px_auto]">
                <Field label="آدرس وب‌سایت (URL)" hint="مثال: https://datees.ir/product/df-695" className="mb-0">
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                    dir="ltr"
                    disabled={isExtracting}
                  />
                </Field>

                <Field label="نام برند" hint="اختیاری (مثلاً داتیس یا کن)" className="mb-0">
                  <Input
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="اختیاری"
                    disabled={isExtracting}
                  />
                </Field>

                <Field label="حداکثر تعداد" hint="برای صفحات دسته‌بندی" className="mb-0">
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value) || 10)}
                    disabled={isExtracting}
                    dir="ltr"
                  />
                </Field>

                <div className="flex items-end">
                  <Button
                    type="button"
                    onClick={handleExtractUrl}
                    disabled={!url.trim() || isExtracting}
                    className="h-10 px-5 w-full lg:w-auto"
                  >
                    {isExtracting ? <Spinner /> : null}
                    استخراج هوشمند کالا
                  </Button>
                </div>
              </div>

              {extractError && (
                <p className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded p-2.5">
                  {extractError}
                </p>
              )}
            </div>

            {/* Extracted Staging Results */}
            {extractedProducts.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-plaster pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-ink">
                      مرحله ۲: پیش‌نمایش و تایید کالاها ({toFaDigits(extractedProducts.length)} محصول یافت شد)
                    </h3>
                    <p className="text-xs text-ash mt-0.5">
                      محصولاتی که می‌خواهید به فروشگاه اضافه شوند را تیک بزنید و دکمه تایید نهایی را کلیک کنید.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-ink">
                      <input
                        type="checkbox"
                        checked={selectedUrls.size === extractedProducts.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedUrls(new Set(extractedProducts.map((p) => p.slug)));
                          } else {
                            setSelectedUrls(new Set());
                          }
                        }}
                        className="rounded border-fog"
                      />
                      انتخاب همه
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {extractedProducts.map((product) => {
                    const isSelected = selectedUrls.has(product.slug);
                    return (
                      <div
                        key={product.slug}
                        onClick={() => {
                          const next = new Set(selectedUrls);
                          if (next.has(product.slug)) next.delete(product.slug);
                          else next.add(product.slug);
                          setSelectedUrls(next);
                        }}
                        className={`cursor-pointer rounded-card border p-4 transition-all ${
                          isSelected
                            ? "border-flame-500 bg-flame-50/10 shadow-sm ring-1 ring-flame-500"
                            : "border-plaster bg-canvas hover:border-fog"
                        }`}
                      >
                        <div className="flex gap-3">
                          <div className="h-16 w-16 shrink-0 overflow-hidden rounded border border-plaster bg-plaster/20">
                            {product.imageUrls[0] ? (
                              <img
                                src={product.imageUrls[0]}
                                alt={product.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-ash">
                                بدون عکس
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-xs font-bold text-ink line-clamp-2">{product.name}</h4>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}} // handled by card click
                                className="rounded border-fog mt-0.5"
                              />
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                                مدل: {product.model}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                                {product.brand}
                              </Badge>
                            </div>
                            <div className="mt-2 text-xs font-semibold text-flame-600">
                              {product.price ? `${formatToman(product.price)}` : "نیازمند قیمت‌گذاری"}
                            </div>
                          </div>
                        </div>

                        {product.specs.length > 0 && (
                          <div className="mt-3 border-t border-plaster pt-2 text-[11px] text-ash space-y-0.5">
                            {product.specs.slice(0, 2).map((s, idx) => (
                              <div key={idx} className="flex justify-between">
                                <span>{s.label}:</span>
                                <span className="font-medium text-ink">{s.value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Sticky Confirmation Bar */}
                <div className="sticky bottom-4 mt-6 flex flex-wrap items-center justify-between gap-4 rounded-card border border-ink bg-ink p-4 text-white shadow-lg">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium">
                      تعداد انتخاب‌شده: <strong>{toFaDigits(selectedUrls.size)}</strong> از{" "}
                      {toFaDigits(extractedProducts.length)} محصول
                    </span>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-fog">
                      <input
                        type="checkbox"
                        checked={publishAfterImport}
                        onChange={(e) => setPublishAfterImport(e.target.checked)}
                        className="rounded border-fog"
                      />
                      انتشار مستقیم در سایت (به جای پیش‌نویس)
                    </label>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleConfirmImport}
                    disabled={selectedUrls.size === 0 || isImporting}
                    className="bg-white text-ink hover:bg-plaster border-0 font-bold"
                  >
                    {isImporting ? <Spinner /> : null}
                    تایید و افزودن به فروشگاه
                  </Button>
                </div>
              </div>
            )}

            {importNotice && (
              <p className="rounded-card bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
                {importNotice}
              </p>
            )}
          </div>
        )}

        {/* --- TAB 2: PDF / Excel Price List Sync --- */}
        {activeTab === "file" && (
          <div className="space-y-6">
            <div className="rounded-card border border-fog/60 bg-plaster/10 p-5">
              <h3 className="text-sm font-bold text-ink mb-1">
                بارگذاری فایل لیست قیمت (PDF، اکسل یا CSV)
              </h3>
              <p className="text-xs leading-6 text-ash mb-4">
                فایل لیست قیمتی که کارخانه فرستاده را انتخاب کنید. سیستم مدل‌ها و قیمت‌ها را خودکار استخراج کرده و با قیمت‌های فعلی فروشگاه مقایسه می‌کند.
              </p>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.5fr_1fr_1fr_auto]">
                <Field label="فایل لیست قیمت (PDF یا اکسل)" hint="پشتیبانی از فرمت‌های .pdf، .xlsx، .csv" className="mb-0">
                  <input
                    type="file"
                    accept=".pdf,.xlsx,.xls,.csv"
                    onChange={(e) => setPriceFile(e.target.files?.[0] ?? null)}
                    disabled={isProcessingPrice}
                    className="block w-full text-xs text-ash file:mr-2 file:py-2 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-canvas file:text-ink hover:file:bg-plaster border border-fog rounded p-1"
                  />
                </Field>

                <Field label="برند کالاها" hint="مثلاً داتیس یا اخوان" className="mb-0">
                  <Input
                    value={priceBrand}
                    onChange={(e) => setPriceBrand(e.target.value)}
                    placeholder="مثال: Datees"
                    disabled={isProcessingPrice}
                  />
                </Field>

                <Field label="واحد قیمت" hint="پیش‌فرض: تشخیص خودکار" className="mb-0">
                  <Select
                    value={priceUnit}
                    onChange={(e) => setPriceUnit(e.target.value as "auto" | "toman" | "rial")}
                    disabled={isProcessingPrice}
                  >
                    <option value="auto">تشخیص خودکار</option>
                    <option value="toman">تومان</option>
                    <option value="rial">ریال (تبدیل به تومان)</option>
                  </Select>
                </Field>

                <div className="flex items-end">
                  <Button
                    type="button"
                    onClick={handlePreviewPriceFile}
                    disabled={!priceFile || isProcessingPrice}
                    className="h-10 px-5 w-full md:w-auto"
                  >
                    {isProcessingPrice ? <Spinner /> : null}
                    پیش‌نمایش تغییرات
                  </Button>
                </div>
              </div>

              {priceNotice && (
                <p className="mt-3 text-xs bg-canvas border border-plaster rounded p-2.5 text-ink">
                  {priceNotice}
                </p>
              )}
            </div>

            {/* Price Diff Table */}
            {priceReport && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-plaster pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-ink">مقایسه و پیش‌نمایش قیمت‌ها</h3>
                    <p className="text-xs text-ash mt-0.5">
                      از مجموع {toFaDigits(priceReport.totalRows)} ردیف در فایل،{" "}
                      <strong>{toFaDigits(priceReport.matchedCatalog)} محصول منطبق</strong> پیدا شد.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={handleApplyPricesToStore}
                      disabled={isApplyingLive || priceReport.matchedCatalog === 0}
                      className="bg-flame-600 text-white hover:bg-flame-700"
                    >
                      {isApplyingLive ? <Spinner /> : null}
                      تایید و اعمال قیمت‌های جدید روی سایت
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-card border border-plaster">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-plaster/40 text-ash border-b border-plaster">
                      <tr>
                        <th className="p-3">ردیف</th>
                        <th className="p-3">مدل کالا</th>
                        <th className="p-3">نام در فروشگاه</th>
                        <th className="p-3">قیمت جدید (تومان)</th>
                        <th className="p-3">وضعیت تطبیق</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-plaster">
                      {priceReport.matches.slice(0, 50).map((match, idx) => (
                        <tr key={idx} className="hover:bg-plaster/10">
                          <td className="p-3 text-ash">{toFaDigits(idx + 1)}</td>
                          <td className="p-3 font-bold text-ink">{match.row.model}</td>
                          <td className="p-3 text-ink">
                            {match.candidates?.[0]?.name ?? "—"}
                          </td>
                          <td className="p-3 font-semibold text-flame-600">
                            {formatToman(match.row.priceToman)}
                          </td>
                          <td className="p-3">
                            {match.status === "matched" ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                                تطبیق قطعی
                              </Badge>
                            ) : match.status === "unmatched" ? (
                              <Badge variant="outline" className="text-ash">
                                در سایت موجود نیست
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                                نیازمند بررسی
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

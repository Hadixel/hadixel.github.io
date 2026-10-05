"use client";

import { toFaDigits } from "@kmodern/contracts";
import { Badge, Button, Card, CardContent, CardHeader, Input } from "@kmodern/ui";
import { Field, Select, Spinner } from "@/components/panel-ui";
import { Metric } from "@/scraper/components/metric";
import { PRICE_MATCH_STATUS_LABELS } from "@/scraper/lib/scraper-labels";
import type { PriceListReport } from "@/scraper/lib/scraper-types";

/**
 * The price-list card: upload a file, preview how it would match, then apply it to the review
 * output. Apply is deliberately gated three ways — a preview must exist, the file must still be
 * there, and unsaved product edits must be confirmed away — because applying rewrites the output
 * every other panel section is reading.
 */
export function PriceListCard({
  file,
  brand,
  unit,
  busy,
  report,
  notice,
  onFileChange,
  onBrandChange,
  onUnitChange,
  onPreview,
  onApply,
}: {
  file: File | null;
  brand: string;
  unit: "auto" | "toman" | "rial";
  busy: "preview" | "apply" | null;
  report: PriceListReport | null;
  notice: string | null;
  onFileChange: (file: File | null) => void;
  onBrandChange: (value: string) => void;
  onUnitChange: (value: "auto" | "toman" | "rial") => void;
  onPreview: () => void;
  onApply: () => void;
}) {
  const needsReview = report?.matches.filter((item) => item.status !== "matched") ?? [];
  return (
    <Card>
      <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">لیست قیمت جدید</h3>
          <p className="mt-0.5 text-sm text-ash">فایل XLSX یا CSV را با ستون‌های مدل و قیمت مصرف‌کننده بدهید؛ فقط تطبیق‌های قطعی روی خروجی بررسی اعمال می‌شوند.</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
          <Field label="فایل قیمت" hint="حداکثر ۱۰ مگابایت" className="mb-0">
            <div className="flex min-w-0 items-center gap-2">
              <input
                id="scraper-price-list-file"
                type="file"
                accept=".xlsx,.xls,.csv"
                className="peer sr-only"
                onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
                disabled={Boolean(busy)}
                aria-label="انتخاب فایل لیست قیمت"
              />
              <label
                htmlFor="scraper-price-list-file"
                className={`inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-card border border-fog bg-canvas px-3 text-sm font-medium text-ink transition-colors hover:bg-plaster peer-focus-visible:ring-2 peer-focus-visible:ring-flame-100 ${busy ? "pointer-events-none opacity-50" : ""}`}
              >
                انتخاب فایل
              </label>
              <span className="min-w-0 truncate text-sm text-ash" dir="ltr" title={file?.name}>
                {file?.name ?? "فایلی انتخاب نشده"}
              </span>
            </div>
          </Field>
          <Field label="برند" hint="برای جلوگیری از تطبیق اشتباه" className="mb-0">
            <Input value={brand} onChange={(event) => onBrandChange(event.target.value)} placeholder="مثلاً Datees" dir="ltr" disabled={Boolean(busy)} />
          </Field>
          <Field label="واحد قیمت" hint="پیش‌فرض: تشخیص از فایل" className="mb-0">
            <Select value={unit} onChange={(event) => onUnitChange(event.target.value as "auto" | "toman" | "rial")} disabled={Boolean(busy)}>
              <option value="auto">تشخیص خودکار</option>
              <option value="toman">تومان</option>
              <option value="rial">ریال</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={onPreview} disabled={!file || Boolean(busy)}>
            {busy === "preview" ? <Spinner /> : null}
            پیش‌نمایش تطبیق
          </Button>
          <Button type="button" onClick={onApply} disabled={!file || !report || Boolean(busy)}>
            {busy === "apply" ? <Spinner /> : null}
            اعمال روی خروجی بررسی
          </Button>
        </div>
        {notice ? <p role="status" aria-live="polite" className="mt-3 rounded-card bg-plaster px-3 py-2 text-sm leading-6 text-ink">{notice}</p> : null}
        {report ? (
          <div className="mt-4 rounded-card border border-plaster p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-ink">نتیجه تطبیق</h4>
              <span className="text-xs text-ash">{toFaDigits(report.validRows)} ردیف معتبر از {toFaDigits(report.totalRows)}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <Metric label="تطبیق قطعی" value={report.matchedCatalog} />
              <Metric label="فقط خام" value={report.rawOnly} />
              <Metric label="بدون محصول" value={report.unmatched} danger={report.unmatched > 0} />
              <Metric label="تعارض" value={report.ambiguous} danger={report.ambiguous > 0} />
              <Metric label="تکراری" value={report.duplicate} danger={report.duplicate > 0} />
              <Metric label="نامعتبر" value={report.invalidRows} danger={report.invalidRows > 0} />
            </dl>
            {report.warnings.length ? <p className="mt-3 text-xs leading-5 text-amber-800">{report.warnings.join(" · ")}</p> : null}
            {needsReview.length ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-flame-700">دیدن ردیف‌های نیازمند بررسی</summary>
                <ul className="mt-2 space-y-1 text-xs text-ash">
                  {needsReview.slice(0, 12).map((item, index) => (
                    <li key={`${item.row.sourceSheet}-${item.row.sourceRow}-${index}`} className="flex flex-wrap items-center gap-2">
                      <Badge className={item.status === "unmatched" || item.status === "invalid" ? "bg-flame-100 text-flame-800" : "bg-plaster text-ink"}>{PRICE_MATCH_STATUS_LABELS[item.status] ?? item.status}</Badge>
                      <span className="break-all" dir="auto">{item.row.sourceModel || "—"}</span>
                      {item.candidates?.length ? <span className="min-w-0 break-words text-ash">{item.candidates.map((candidate) => candidate.name).join(" · ")}</span> : null}
                    </li>
                  ))}
                  {needsReview.length > 12 ? <li>و {toFaDigits(needsReview.length - 12)} ردیف دیگر در گزارش کامل.</li> : null}
                </ul>
              </details>
            ) : null}
            <p className="mt-3 text-xs leading-5 text-ash">اعمال، فقط خروجی بررسی را تغییر می‌دهد؛ انتشار و ورود به فروشگاه همچنان با دکمه انتخاب محصول انجام می‌شود.</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatJalaliDateTime } from "@/lib/date";
import type { ScraperJobSnapshot, ScraperJobStatus } from "@/lib/scraper-types";
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
  faDigits,
} from "@/components/ui";

interface SourceOption {
  id: string;
  label: string;
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
  const [source, setSource] = useState("all");
  const [limit, setLimit] = useState("");
  const [cache, setCache] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const active = job?.status === "running" || job?.status === "cancelling";
  const progress = useMemo(() => {
    if (!job?.total) return job && active ? 8 : 0;
    return Math.min(100, Math.round((job.current / job.total) * 100));
  }, [active, job]);

  const request = useCallback(async (init?: RequestInit) => {
    const response = await fetch("/api/admin/scraper", {
      credentials: "same-origin",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const data = (await response.json()) as ScraperJobSnapshot & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "پاسخ نامعتبر از سرور");
    return data;
  }, []);

  const refresh = useCallback(async () => {
    try {
      setJob(await request());
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error) });
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(timer);
  }, [active, refresh]);

  async function start() {
    setBusy(true);
    setNotice(null);
    try {
      const body = JSON.stringify({
        source,
        limit: limit.trim() ? Number(limit) : null,
        cache,
      });
      setJob(await request({ method: "POST", body }));
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setNotice(null);
    try {
      setJob(await request({ method: "DELETE" }));
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  const status = job ? STATUS[job.status] : STATUS.idle;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">اسکرپر کاتالوگ</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ash">
            داده خام سازنده را می‌گیرد، به سبک فروشگاه فارسی تبدیل می‌کند و فقط خروجی قابل بررسی می‌سازد.
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
        <Card>
          <CardHeader title="خروجی قابل بررسی" subtitle="این فایل‌ها هنوز به‌صورت خودکار وارد فروشگاه نمی‌شوند." />
          <CardBody>
            <div className="flex flex-wrap gap-2">
              <DownloadLink filename="catalog.fragment.json" label="دانلود catalog.fragment.json" />
              <DownloadLink filename="raw-scrape.json" label="دانلود raw-scrape.json" />
              <DownloadLink filename="merge-report.json" label="دانلود merge-report.json" />
            </div>
            {job.outputDir ? <p className="mt-4 break-all text-xs leading-5 text-ash" dir="ltr">{job.outputDir}</p> : null}
          </CardBody>
        </Card>
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

function DownloadLink({ filename, label }: { filename: string; label: string }) {
  return (
    <a
      href={`/api/admin/scraper?download=${encodeURIComponent(filename)}`}
      className="rounded-card border border-fog px-3 py-2 text-sm text-ink transition-colors hover:bg-plaster focus:outline-none focus:ring-2 focus:ring-flame-300"
    >
      {label}
    </a>
  );
}

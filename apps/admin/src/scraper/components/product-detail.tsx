"use client";

import { useEffect, useState, type FormEvent } from "react";
import { formatToman, toFaDigits } from "@kmodern/contracts";
import { Button, Input, Textarea } from "@kmodern/ui";
import { Field, Select } from "@/components/panel-ui";
import { COLOR_LABELS, ROOT_LABELS, SCRAPE_SUB_LABELS, SUB_LABELS, labelOptions } from "@/scraper/lib/scraper-labels";
import { safeExternalUrl, safePreviewUrl } from "@/scraper/lib/scraper-format";
import { websiteLabel } from "@/scraper/lib/scraper-catalog";
import type { ScraperCatalogEdit, ScraperCatalogItem } from "@/scraper/lib/scraper-types";

/**
 * The per-product editor. Its draft fields are its own state on purpose: an operator types half a
 * price and clicks another row, and the panel must not throw that away because the parent re-rendered.
 * The draft is seeded from `item` and reseeded whenever `item` changes, which is the only moment a
 * half-finished edit is legitimately lost.
 */
export function ProductDetail({
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
    <div className="rounded-card bg-plaster/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ash" dir="ltr">{item.slug} · {item._id}</p>
          <p className="mt-2 text-xs text-ash">
            سازنده: <span className="text-ink">{item.brand || "نامشخص"}</span>
            {sourceSite ? <> · <a href={sourceSite} target="_blank" rel="noreferrer" className="text-flame-700 underline underline-offset-2" dir="ltr">{websiteLabel(item)}</a></> : null}
            {sourcePage ? <> · <a href={sourcePage} target="_blank" rel="noreferrer" className="text-flame-700 underline underline-offset-2">صفحه محصول</a></> : null}
            {priceSource ? <> · <a href={priceSource} target="_blank" rel="noreferrer" className="text-flame-700 underline underline-offset-2">منبع قیمت</a></> : null}
          </p>
          <p className="mt-1 text-micro text-ash">برند، مدل، رنگ و تصاویر برای حفظ هویت محصول و SKU از ویرایش مستقیم خارج هستند.</p>
          {item.priceInStock === false ? <p className="mt-1 text-micro text-red-700">این محصول در منبع قیمت‌دهی ناموجود است.</p> : null}
          {item.priceByColor && Object.keys(item.priceByColor).length ? (
            <p className="mt-1 text-micro text-ash">قیمت‌های رنگی: {Object.entries(item.priceByColor).map(([color, value]) => `${COLOR_LABELS[color] ?? color}: ${formatToman(value)}`).join(" · ")}</p>
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>بستن</Button>
      </div>

      <form className="mt-5 space-y-4" onSubmit={save}>
        <div className="form-grid">
          <Field label="نام محصول" className="mb-0">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="قیمت (تومان)" hint="برای انتشار اجباری است؛ خالی یعنی نیازمند قیمت." className="mb-0">
            <Input type="number" min={0} step={1} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="نیازمند قیمت" />
          </Field>
          <Field label="دسته اصلی" className="mb-0">
            <Select value={category} onChange={(event) => { setCategory(event.target.value); setSubCategory(SCRAPE_SUB_LABELS[event.target.value]?.[0] ?? "all"); }}>
              {labelOptions(ROOT_LABELS).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
        <div className="form-grid">
          <Field label="ویژگی‌ها" hint="هر ویژگی را در یک خط بنویسید." className="mb-0">
            <Textarea value={features} onChange={(event) => setFeatures(event.target.value)} dir="auto" />
          </Field>
          <Field label="مشخصات فنی" hint="هر سطر به شکل «برچسب: مقدار»." className="mb-0">
            <Textarea value={specs} onChange={(event) => setSpecs(event.target.value)} dir="auto" />
          </Field>
        </div>
        {error ? <p role="alert" className="notice-error-strong">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!dirty}>ذخیره ویرایش</Button>
          <Button type="button" variant="outline" onClick={onReset} disabled={!dirty}>بازگردانی</Button>
        </div>
      </form>

      {previewImages.length ? (
        <div className="mt-5">
          <h4 className="mb-2 text-sm font-semibold text-ink">تصاویر ({toFaDigits(previewImages.length)} از {toFaDigits(item.image.length)})</h4>
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

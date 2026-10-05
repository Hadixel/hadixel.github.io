"use client";

// Product form (004): core fields, per-category spec values, variants,
// SEO block. Serializes variants/specValues/seo to JSON for the server action.
// Used by both /products/new and /products/[id].

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveProduct } from "@/catalogue/lib/product-actions";
import { idle, type ActionResult } from "@/lib/actions/result";
import { MediaPickerButton } from "@/media/components/media-picker-button";
import { Button, Card, CardContent, CardHeader, Checkbox, Input, Textarea } from "@kmodern/ui";
import { Field, Select } from "@/components/panel-ui";

export interface CategoryOption {
  id: string;
  name: string;
  specFields: Array<{ id: string; name: string; type: string; unit: string | null }>;
}

export interface ProductSeed {
  product?: {
    id: string;
    name: string;
    brand: string;
    model: string;
    slug: string;
    categoryId: string;
    description: string | null;
    features: string[];
    status: string;
    allowBackorder: boolean;
    seo: Record<string, unknown> | null;
    variants: Array<{
      id: string;
      colorName: string;
      colorCode: string | null;
      sku: string;
      price: number;
      stock: number;
      allowBackorder: boolean;
      images: string[];
    }>;
    specValues: Record<string, string>;
  };
  categories: CategoryOption[];
}

export function ProductForm({ product, categories }: ProductSeed) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(saveProduct, idle);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const p = product;
  const [categoryId, setCategoryId] = useState(p?.categoryId ?? "");
  const specFields = categories.find((c) => c.id === categoryId)?.specFields ?? [];
  const [specValues, setSpecValues] = useState<Record<string, string>>(p?.specValues ?? {});
  // variants keyed by a local uid so unsaved rows can be removed too;
  // `id` stays empty until the row is saved server-side
  const [variants, setVariants] = useState(() =>
    (p?.variants.length ? p.variants : [emptyVariant()]).map((v, i) => ({
      ...v,
      uid: v.id || `new-${Date.now()}-${i}`,
    })),
  );
  const [imagesByVariant, setImagesByVariant] = useState<Record<string, string>>(
    Object.fromEntries(
      (p?.variants.length ? p.variants : []).map((v) => [v.id || `unsaved`, v.images.join("\n")]),
    ),
  );
  const [features, setFeatures] = useState((p?.features ?? []).join("\n"));
  const [seo, setSeo] = useState({
    title: (p?.seo?.title as string) ?? "",
    description: (p?.seo?.description as string) ?? "",
    ogImage: (p?.seo?.ogImage as string) ?? "",
    canonical: (p?.seo?.canonical as string) ?? "",
    noindex: Boolean(p?.seo?.noindex),
    robots: (p?.seo?.robots as string) ?? "index, follow",
  });

  const setVariant = (i: number, patch: Partial<(typeof variants)[number]>) =>
    setVariants((vs) => vs.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={p?.id ?? ""} />
      <div className="space-y-5">
        <Card>
          <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
            <h2 className="text-base font-semibold text-ink">اطلاعات پایه</h2>
          </CardHeader>
          <CardContent>
            <div className="form-grid">
              <Field label="نام محصول" required>
                <Input name="name" defaultValue={p?.name} required />
              </Field>
              <Field label="برند" required>
                <Input name="brand" defaultValue={p?.brand} required />
              </Field>
              <Field label="مدل" required hint="مثلاً 203">
                <Input name="model" defaultValue={p?.model} required dir="ltr" />
              </Field>
              <Field label="اسلاگ" required>
                <Input name="slug" defaultValue={p?.slug} required dir="ltr" />
              </Field>
              <Field label="دسته‌بندی" required>
                <select
                  name="categoryId"
                  className="form-control w-full"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                >
                  <option value="" disabled>انتخاب دسته…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="وضعیت">
                <Select name="status" defaultValue={p?.status ?? "DRAFT"}>
                  <option value="DRAFT">پیش‌نویس</option>
                  <option value="PUBLISHED">منتشر شده</option>
                  <option value="ARCHIVED">بایگانی</option>
                </Select>
              </Field>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
              <Checkbox name="allowBackorder" defaultChecked={p?.allowBackorder} />
              مجاز بودن سفارش بدون موجودی (پس‌افت)
            </label>
            <Field label="توضیحات">
              <Textarea name="description" defaultValue={p?.description ?? ""} />
            </Field>
            <Field label="ویژگی‌ها (هر مورد در یک خط)">
              <Textarea name="features" value={features} onChange={(e) => setFeatures(e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        {/* spec values */}
        {specFields.length > 0 && (
          <Card>
            <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-ink">مشخصات فنی</h2>
                <p className="mt-0.5 text-sm text-ash">{`بر اساس فیلدهای دسته "${categories.find((c) => c.id === categoryId)?.name}"`}</p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="form-grid">
                {specFields.map((sf) => (
                  <Field key={sf.id} label={`${sf.name}${sf.unit ? ` (${sf.unit})` : ""}`}>
                    <Input
                      type={sf.type === "number" ? "number" : "text"}
                      value={specValues[sf.id] ?? ""}
                      onChange={(e) => setSpecValues({ ...specValues, [sf.id]: e.target.value })}
                    />
                  </Field>
                ))}
              </div>
              <input type="hidden" name="specValues" value={JSON.stringify(Object.fromEntries(
                Object.entries(specValues).filter(([, v]) => v !== ""),
              ))} />
              </CardContent>
          </Card>
        )}

        {/* variants */}
        <Card>
          <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink">تنوع‌ها</h2>
              <p className="mt-0.5 text-sm text-ash">هر رنگ = یک تنوع با قیمت/موجودی/SKU/تصاویر جداگانه</p>
            </div>
            <div className="shrink-0">
              <button type="button" onClick={() => setVariants((vs) => [...vs, { ...emptyVariant(), uid: `new-${Date.now()}` }])} className="form-control-compact">
                + تنوع
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {variants.map((v, i) => (
              <div key={v.uid} className="rounded-card border border-plaster p-3">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Field label="نام رنگ"><Input value={v.colorName} onChange={(e) => setVariant(i, { colorName: e.target.value })} /></Field>
                  <Field label="کد رنگ"><Input value={v.colorCode ?? ""} dir="ltr" onChange={(e) => setVariant(i, { colorCode: e.target.value })} /></Field>
                  <Field label="SKU" required><Input value={v.sku} dir="ltr" required onChange={(e) => setVariant(i, { sku: e.target.value })} /></Field>
                  <Field label="قیمت (تومان)" required><Input type="number" value={v.price} dir="ltr" required onChange={(e) => setVariant(i, { price: Number(e.target.value) || 0 })} /></Field>
                  <Field label="موجودی"><Input type="number" value={v.stock} dir="ltr" onChange={(e) => setVariant(i, { stock: Number(e.target.value) || 0 })} /></Field>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
                    <Checkbox checked={v.allowBackorder} onCheckedChange={(c) => setVariant(i, { allowBackorder: c === true })} />
                    مجموع پس‌کرایه
                  </label>
                  <button type="button" onClick={() => setVariants((vs) => vs.filter((_, idx) => idx !== i))} className="text-sm text-red-600 hover:underline">
                    حذف تنوع
                  </button>
                </div>
                <Field label="تصاویر (هر URL در یک خط)">
                  <div className="flex items-start gap-2">
                  <Textarea
                    value={imagesByVariant[v.uid] ?? v.images.join("\n")}
                    onChange={(e) => setImagesByVariant({ ...imagesByVariant, [v.uid]: e.target.value })}
                    />
                    <MediaPickerButton
                      onPick={(url) =>
                        setImagesByVariant((m) => {
                          const cur = (m[v.uid] ?? v.images.join("\n")).split("\n").map((s) => s.trim()).filter(Boolean);
                          return { ...m, [v.uid]: [...cur, url].join("\n") };
                        })
                      }
                    />
                  </div>
                </Field>
              </div>
            ))}
            <input type="hidden" name="variants" value={JSON.stringify(variants.map((v) => ({
              id: v.id,
              colorName: v.colorName,
              colorCode: v.colorCode ?? "",
              sku: v.sku,
              price: v.price,
              stock: v.stock,
              allowBackorder: v.allowBackorder,
              images: (imagesByVariant[v.uid] ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
            })))} />
          </CardContent>
        </Card>

        {/* seo */}
        <Card>
          <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
            <h2 className="text-base font-semibold text-ink">بهینه‌سازی (SEO)</h2>
          </CardHeader>
          <CardContent>
            <div className="form-grid">
<Field label="عنوان (حداکثر ۷۰)" hint={`${seo.title.length}/۷۰`}>
                <Input value={seo.title} maxLength={70} onChange={(e) => setSeo({ ...seo, title: e.target.value })} />
              </Field>
              <Field label="توضیح (حداکثر ۱۶۰)" hint={`${seo.description.length}/۱۶۰`}>
                <Input value={seo.description} maxLength={160} onChange={(e) => setSeo({ ...seo, description: e.target.value })} />
              </Field>
              <Field label="تصویر اشتراک‌گذاری (OG)"><Input value={seo.ogImage} dir="ltr" onChange={(e) => setSeo({ ...seo, ogImage: e.target.value })} /></Field>
              <Field label="URL متعارف"><Input value={seo.canonical} dir="ltr" onChange={(e) => setSeo({ ...seo, canonical: e.target.value })} /></Field>
              <Field label="robots"><Input value={seo.robots} dir="ltr" onChange={(e) => setSeo({ ...seo, robots: e.target.value })} /></Field>
              <div className="flex items-end pb-2"><label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink"><Checkbox checked={seo.noindex} onCheckedChange={(c) => setSeo({ ...seo, noindex: c === true })} />ممنوعیت ایندکس (noindex)</label></div>
            </div>
            <input type="hidden" name="seo" value={JSON.stringify(seo)} />
          </CardContent>
        </Card>

        {/* Narrowed on `ok`, which is the point of the union: the old `ActionState` had four optional
            fields, so a failure with no message type-checked and rendered an empty box. A successful
            save redirects, so there is no success line to show here. */}
        {!state.ok && <p role="alert" className="notice-error">{state.error}</p>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>انصراف</Button>
          <Button type="submit" disabled={pending}>{pending ? "در حال ذخیره…" : "ذخیره محصول"}</Button>
        </div>
      </div>
    </form>
  );
}

function emptyVariant() {
  return { id: "", uid: "", colorName: "", colorCode: "", sku: "", price: 0, stock: 0, allowBackorder: false, images: [] as string[] };
}
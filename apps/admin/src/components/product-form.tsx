"use client";

// Product form (004): core fields, per-category spec values, variants,
// SEO block. Serializes variants/specValues/seo to JSON for the server action.
// Used by both /products/new and /products/[id].

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveProduct } from "@/lib/actions/catalog";
import type { ActionState } from "@/lib/actions/auth";
import { Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";

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
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveProduct, {});
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const p = product;
  const [categoryId, setCategoryId] = useState(p?.categoryId ?? "");
  const specFields = categories.find((c) => c.id === categoryId)?.specFields ?? [];
  const [specValues, setSpecValues] = useState<Record<string, string>>(p?.specValues ?? {});
  const [variants, setVariants] = useState(p?.variants ?? [emptyVariant()]);
  const [imagesByVariant, setImagesByVariant] = useState<Record<string, string>>(
    Object.fromEntries((p?.variants ?? []).map((v) => [v.id, v.images.join("\n")])),
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
          <CardHeader title="اطلاعات پایه" />
          <CardBody>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
            <Checkbox name="allowBackorder" label="مجاز بودن سفارش بدون موجودی (پس‌افت)" defaultChecked={p?.allowBackorder} />
            <Field label="توضیحات">
              <Textarea name="description" defaultValue={p?.description ?? ""} />
            </Field>
            <Field label="ویژگی‌ها (هر مورد در یک خط)">
              <Textarea name="features" value={features} onChange={(e) => setFeatures(e.target.value)} />
            </Field>
          </CardBody>
        </Card>

        {/* spec values */}
        {specFields.length > 0 && (
          <Card>
            <CardHeader title="مشخصات فنی" subtitle={`بر اساس فیلدهای دسته "${categories.find((c) => c.id === categoryId)?.name}"`} />
            <CardBody>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
            </CardBody>
          </Card>
        )}

        {/* variants */}
        <Card>
          <CardHeader
            title="تنوع‌ها"
            subtitle="هر رنگ = یک تنوع با قیمت/موجودی/SKU/تصاویر جداگانه"
            actions={
              <button type="button" onClick={() => setVariants((vs) => [...vs, emptyVariant()])} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                + تنوع
              </button>
            }
          />
          <CardBody className="space-y-4">
            {variants.map((v, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Field label="نام رنگ"><Input value={v.colorName} onChange={(e) => setVariant(i, { colorName: e.target.value })} /></Field>
                  <Field label="کد رنگ"><Input value={v.colorCode ?? ""} dir="ltr" onChange={(e) => setVariant(i, { colorCode: e.target.value })} /></Field>
                  <Field label="SKU" required><Input value={v.sku} dir="ltr" required onChange={(e) => setVariant(i, { sku: e.target.value })} /></Field>
                  <Field label="قیمت (تومان)" required><Input type="number" value={v.price} dir="ltr" required onChange={(e) => setVariant(i, { price: Number(e.target.value) || 0 })} /></Field>
                  <Field label="موجودی"><Input type="number" value={v.stock} dir="ltr" onChange={(e) => setVariant(i, { stock: Number(e.target.value) || 0 })} /></Field>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <Checkbox label="مجموی پس‌افت" checked={v.allowBackorder} onChange={(e) => setVariant(i, { allowBackorder: e.target.checked })} />
                  {v.id && (
                    <button type="button" onClick={() => setVariants((vs) => vs.filter((_, idx) => idx !== i))} className="text-sm text-red-600 hover:underline">
                      حذف تنوع
                    </button>
                  )}
                </div>
                <Field label="تصاویر (هر URL در یک خط)">
                  <Textarea
                    value={imagesByVariant[v.id ?? `__${i}`] ?? v.images.join("\n")}
                    onChange={(e) => setImagesByVariant({ ...imagesByVariant, [v.id ?? `__${i}`]: e.target.value })}
                  />
                </Field>
              </div>
            ))}
            <input type="hidden" name="variants" value={JSON.stringify(variants.map((v, i) => ({
              id: v.id,
              colorName: v.colorName,
              colorCode: v.colorCode ?? "",
              sku: v.sku,
              price: v.price,
              stock: v.stock,
              allowBackorder: v.allowBackorder,
              images: (imagesByVariant[v.id ?? `__${i}`] ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
            })))} />
          </CardBody>
        </Card>

        {/* seo */}
        <Card>
          <CardHeader title="بهینه‌سازی (SEO)" />
          <CardBody>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
<Field label="عنوان (حداکثر ۷۰)" hint={`${seo.title.length}/۷۰`}>
                <Input value={seo.title} maxLength={70} onChange={(e) => setSeo({ ...seo, title: e.target.value })} />
              </Field>
              <Field label="توضیح (حداکثر ۱۶۰)" hint={`${seo.description.length}/۱۶۰`}>
                <Input value={seo.description} maxLength={160} onChange={(e) => setSeo({ ...seo, description: e.target.value })} />
              </Field>
              <Field label="تصویر اشتراک‌گذاری (OG)"><Input value={seo.ogImage} dir="ltr" onChange={(e) => setSeo({ ...seo, ogImage: e.target.value })} /></Field>
              <Field label="URL متعارف"><Input value={seo.canonical} dir="ltr" onChange={(e) => setSeo({ ...seo, canonical: e.target.value })} /></Field>
              <Field label="robots"><Input value={seo.robots} dir="ltr" onChange={(e) => setSeo({ ...seo, robots: e.target.value })} /></Field>
              <div className="flex items-end pb-2"><Checkbox label="ممنوعیت ایندکس (noindex)" checked={seo.noindex} onChange={(e) => setSeo({ ...seo, noindex: e.target.checked })} /></div>
            </div>
            <input type="hidden" name="seo" value={JSON.stringify(seo)} />
          </CardBody>
        </Card>

        {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => router.back()}>انصراف</Button>
          <Button type="submit" disabled={pending}>{pending ? "در حال ذخیره…" : "ذخیره محصول"}</Button>
        </div>
      </div>
    </form>
  );
}

function emptyVariant() {
  return { id: "", colorName: "", colorCode: "", sku: "", price: 0, stock: 0, allowBackorder: false, images: [] as string[] };
}
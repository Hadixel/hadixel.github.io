"use client";

// Navigation editor (006) — three menus (HEADER/FOOTER/MOBILE), each a
// recursive item tree; saved as a full replace per location. Item target is
// a typed link object; CATEGORY childSource auto-populates children on the
// storefront. Promos are optional per top-level item.

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveNav } from "@/lib/actions/content";
import type { ActionState } from "@/lib/actions/auth";
import { Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";

type TargetType = "PAGE" | "CATEGORY" | "COLLECTION" | "PRODUCT" | "EXTERNAL" | "SECTION";

interface PromoState {
  imageUrl: string;
  alt: string;
  linkType: TargetType;
  linkValue: string;
  heading: string;
  subtext: string;
  mobileVisible: boolean;
}

export interface ItemState {
  key: string;
  label: string;
  targetType: TargetType;
  targetValue: string;
  childSource: "STATIC" | "CATEGORY";
  categoryId: string;
  display: "DROPDOWN" | "MEGA";
  visible: boolean;
  mobileVisible: boolean;
  children: ItemState[];
  promos: PromoState[];
}

const TARGET_LABELS: Record<TargetType, string> = {
  PAGE: "صفحه داخلی",
  CATEGORY: "دسته‌بندی",
  COLLECTION: "مجموعه",
  PRODUCT: "محصول",
  EXTERNAL: "لینک خارجی",
  SECTION: "بخش صفحه",
};

export interface NavSeed {
  location: string;
  name: string;
  items: ItemState[];
  categories: Array<{ id: string; name: string; slug: string }>;
  pages: Array<{ id: string; slug: string; title: string }>;
  collections: Array<{ id: string; name: string }>;
}

interface ItemInput {
  label: string;
  target: { type: string; value: string };
  childSource: "STATIC" | "CATEGORY";
  categoryId?: string;
  display: "DROPDOWN" | "MEGA";
  visible: boolean;
  mobileVisible: boolean;
  children: ItemInput[];
  promos: Array<{
    imageUrl: string;
    alt: string;
    link: { type: string; value: string };
    heading?: string;
    subtext?: string;
    mobileVisible: boolean;
  }>;
}

function itemToInput(item: ItemState): ItemInput {
  return {
    label: item.label,
    target: { type: item.targetType, value: item.targetValue },
    childSource: item.childSource,
    categoryId: item.categoryId || undefined,
    display: item.display,
    visible: item.visible,
    mobileVisible: item.mobileVisible,
    children: item.children.map(itemToInput),
    promos: item.promos.map((p) => ({
      imageUrl: p.imageUrl,
      alt: p.alt,
      link: { type: p.linkType, value: p.linkValue },
      heading: p.heading || undefined,
      subtext: p.subtext || undefined,
      mobileVisible: p.mobileVisible,
    })),
  };
}

const newItem = (): ItemState => ({
  key: `i-${Math.random().toString(36).slice(2, 8)}`,
  label: "",
  targetType: "PAGE",
  targetValue: "",
  childSource: "STATIC",
  categoryId: "",
  display: "DROPDOWN",
  visible: true,
  mobileVisible: true,
  children: [],
  promos: [],
});

export function NavEditor({ seed }: { seed: NavSeed }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveNav, {});
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const [items, setItems] = useState<ItemState[]>(seed.items);

  const patchItem = (path: number[], patch: Partial<ItemState>) =>
    setItems((items) => {
      const copy = structuredClone(items);
      let node: ItemState = copy[path[0]];
      for (let i = 1; i < path.length; i++) node = node.children[path[i]];
      Object.assign(node, patch);
      return copy;
    });

  const removeItem = (path: number[]) =>
    setItems((items) => {
      const copy = structuredClone(items);
      if (path.length === 1) {
        copy.splice(path[0], 1);
        return copy;
      }
      let node: ItemState = copy[path[0]];
      for (let i = 1; i < path.length - 1; i++) node = node.children[path[i]];
      node.children.splice(path[path.length - 1], 1);
      return copy;
    });

  const addChild = (path: number[]) =>
    setItems((items) => {
      const copy = structuredClone(items);
      let node: ItemState = copy[path[0]];
      for (let i = 1; i < path.length; i++) node = node.children[path[i]];
      node.children.push(newItem());
      return copy;
    });

  const addRoot = () => setItems((items) => [...items, newItem()]);

  const addPromo = (path: number[]) =>
    setItems((items) => {
      const copy = structuredClone(items);
      let node: ItemState = copy[path[0]];
      for (let i = 1; i < path.length; i++) node = node.children[path[i]];
      node.promos.push({
        imageUrl: "",
        alt: "",
        linkType: "PAGE",
        linkValue: "",
        heading: "",
        subtext: "",
        mobileVisible: false,
      });
      return copy;
    });

  const patchPromo = (path: number[], promoIndex: number, patch: Partial<PromoState>) =>
    setItems((items) => {
      const copy = structuredClone(items);
      let node: ItemState = copy[path[0]];
      for (let i = 1; i < path.length; i++) node = node.children[path[i]];
      Object.assign(node.promos[promoIndex], patch);
      return copy;
    });

  const removePromo = (path: number[], promoIndex: number) =>
    setItems((items) => {
      const copy = structuredClone(items);
      let node: ItemState = copy[path[0]];
      for (let i = 1; i < path.length; i++) node = node.children[path[i]];
      node.promos.splice(promoIndex, 1);
      return copy;
    });

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="location" value={seed.location} />
      <input type="hidden" name="name" value={seed.name} />
      <input type="hidden" name="items" value={JSON.stringify(items.map(itemToInput))} />

      <Card>
        <CardHeader title={`منوی ${seed.location === "HEADER" ? "سربرگ" : seed.location === "FOOTER" ? "پاصفحه" : "موبایل"}`} subtitle={seed.name} />
        <CardBody>
          <div className="mb-4 flex items-center gap-3">
            <span className="text-sm text-slate-600">ساختار درختی منو:</span>
            <Button type="button" variant="secondary" onClick={addRoot}>+ افزودن آیتم ریشه</Button>
            <span className="text-xs text-slate-400">{items.length} آیتم ریشه</span>
          </div>

          <div className="space-y-3">
            {items.map((item, i) => (
              <ItemEditor
                key={item.key}
                item={item}
                path={[i]}
                depth={0}
                seed={seed}
                patchItem={patchItem}
                removeItem={removeItem}
                addChild={addChild}
                addPromo={addPromo}
                patchPromo={patchPromo}
                removePromo={removePromo}
              />
            ))}
            {items.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-400">منو خالی است</p>
            )}
          </div>
        </CardBody>
      </Card>

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.message}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? "در حال ذخیره…" : "ذخیره منو"}</Button>
      </div>
    </form>
  );
}

function ItemEditor({
  item,
  path,
  depth,
  seed,
  patchItem,
  removeItem,
  addChild,
  addPromo,
  patchPromo,
  removePromo,
}: {
  item: ItemState;
  path: number[];
  depth: number;
  seed: NavSeed;
  patchItem: (path: number[], patch: Partial<ItemState>) => void;
  removeItem: (path: number[]) => void;
  addChild: (path: number[]) => void;
  addPromo: (path: number[]) => void;
  patchPromo: (path: number[], index: number, patch: Partial<PromoState>) => void;
  removePromo: (path: number[], index: number) => void;
}) {
  const isCategory = item.childSource === "CATEGORY";

  return (
    <div className={`rounded-xl border bg-white ${depth > 0 ? "ml-6 border-slate-200" : "border-slate-300"}`}>
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="عنوان"><Input value={item.label} onChange={(e) => patchItem(path, { label: e.target.value })} /></Field>
          <Field label="نوع لینک">
            <Select value={item.targetType} onChange={(e) => patchItem(path, { targetType: e.target.value as TargetType })}>
              {Object.entries(TARGET_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="مقدار لینک">
            {item.targetType === "PAGE" ? (
              <Select value={item.targetValue} onChange={(e) => patchItem(path, { targetValue: e.target.value })}>
                <option value="" disabled>انتخاب صفحه…</option>
                {seed.pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </Select>
            ) : item.targetType === "CATEGORY" ? (
              <Select value={item.targetValue} onChange={(e) => patchItem(path, { targetValue: e.target.value })}>
                <option value="" disabled>انتخاب دسته…</option>
                {seed.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            ) : item.targetType === "COLLECTION" ? (
              <Select value={item.targetValue} onChange={(e) => patchItem(path, { targetValue: e.target.value })}>
                <option value="" disabled>انتخاب مجموعه…</option>
                {seed.collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            ) : (
              <Input dir="ltr" value={item.targetValue} onChange={(e) => patchItem(path, { targetValue: e.target.value })} />
            )}
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Field label="نمایش زیرمنو">
            <Select value={item.childSource} onChange={(e) => patchItem(path, { childSource: e.target.value as "STATIC" | "CATEGORY" })}>
              <option value="STATIC">ساختار دستی</option>
              <option value="CATEGORY">خودکار از دسته</option>
            </Select>
          </Field>
          {isCategory && (
            <Field label="دسته">
              <Select value={item.categoryId} onChange={(e) => patchItem(path, { categoryId: e.target.value })}>
                <option value="" disabled>انتخاب دسته…</option>
                {seed.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="نوع نمایش">
            <Select value={item.display} onChange={(e) => patchItem(path, { display: e.target.value as "DROPDOWN" | "MEGA" })}>
              <option value="DROPDOWN">منوی کشویی</option>
              <option value="MEGA">مگامنو</option>
            </Select>
          </Field>
          <div className="flex items-end gap-3 pb-2">
            <Checkbox label="نمایش" checked={item.visible} onChange={(e) => patchItem(path, { visible: e.target.checked })} />
            <Checkbox label="موبایل" checked={item.mobileVisible} onChange={(e) => patchItem(path, { mobileVisible: e.target.checked })} />
          </div>
          <div className="flex-1" />
          <Button type="button" variant="danger" size="sm" onClick={() => removeItem(path)}>حذف</Button>
        </div>

        {!isCategory && (
          <div className="space-y-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => addChild(path)}>+ زیرمنو</Button>
            {item.children.map((child, i) => (
              <ItemEditor
                key={child.key}
                item={child}
                path={[...path, i]}
                depth={depth + 1}
                seed={seed}
                patchItem={patchItem}
                removeItem={removeItem}
                addChild={addChild}
                addPromo={addPromo}
                patchPromo={patchPromo}
                removePromo={removePromo}
              />
            ))}
          </div>
        )}

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">بنرهای پیشنهادی (Promo)</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => addPromo(path)}>+ تبلیغ</Button>
          </div>
          {item.promos.length > 0 && (
            <div className="space-y-2">
              {item.promos.map((p, k) => (
                <div key={k} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <Input placeholder="آدرس تصویر" dir="ltr" value={p.imageUrl} onChange={(e) => patchPromo(path, k, { imageUrl: e.target.value })} />
                    <Input placeholder="متن جایگزین" value={p.alt} onChange={(e) => patchPromo(path, k, { alt: e.target.value })} />
                    <Select value={p.linkType} onChange={(e) => patchPromo(path, k, { linkType: e.target.value as TargetType })}>
                      {Object.entries(TARGET_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </Select>
                    <Input placeholder="مقدار لینک" dir="ltr" value={p.linkValue} onChange={(e) => patchPromo(path, k, { linkValue: e.target.value })} />
                    <Input placeholder="عنوان" value={p.heading} onChange={(e) => patchPromo(path, k, { heading: e.target.value })} />
                    <Input placeholder="زیرعنوان" value={p.subtext} onChange={(e) => patchPromo(path, k, { subtext: e.target.value })} />
                    <Checkbox label="نمایش در موبایل" checked={p.mobileVisible} onChange={(e) => patchPromo(path, k, { mobileVisible: e.target.checked })} />
                  </div>
                  <button type="button" className="mt-2 text-xs text-red-600" onClick={() => removePromo(path, k)}>حذف تبلیغ</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
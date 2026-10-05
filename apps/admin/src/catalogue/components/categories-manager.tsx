"use client";
import { toFaDigits } from "@kmodern/contracts";

// Category tree (004/011): 2-level hierarchy, weightKg required, inline
// spec-field editor per category. One form per category (add or edit) plus
// guarded delete (only empty, childless categories).

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveCategory, deleteCategory } from "@/catalogue/lib/category-actions";
import { idle, type ActionResult } from "@/lib/actions/result";
import { Badge, Button, Card, CardContent, CardHeader, Checkbox, Input } from "@kmodern/ui";
import { Field, Select } from "@/components/panel-ui";

interface SpecFieldSeed {
  id?: string;
  name: string;
  type: string;
  unit?: string;
  filterable: boolean;
  sortOrder: number;
}

interface CategorySeed {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  parentName?: string;
  weightKg: number;
  sortOrder: number;
  productCount: number;
  childCount: number;
  specFields: SpecFieldSeed[];
}

export function CategoriesManager({ categories }: { categories: CategorySeed[] }) {
  const roots = categories.filter((c) => !c.parentId);
  const byParent = (pid: string | null) => categories.filter((c) => c.parentId === pid);

  return (
    <div className="space-y-5">
      <AddCategoryForm roots={roots} />
      {roots.map((root) => (
        <CategoryCard key={root.id} category={root} childrenCats={byParent(root.id)} />
      ))}
    </div>
  );
}

function AddCategoryForm({ roots }: { roots: CategorySeed[] }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(saveCategory, idle);
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  return (
    <Card>
      <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
        <h2 className="text-base font-semibold text-ink">افزودن دسته‌بندی</h2>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <Field label="نام" required><Input name="name" required /></Field>
          <Field label="اسلاگ" required><Input name="slug" dir="ltr" required /></Field>
          <Field label="دستهٔ والد (اختیاری)">
            <Select name="parentId" defaultValue="">
              <option value="">— ریشه —</option>
              {roots.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="وزن (kg)" required hint="الزامی">
            <Input name="weightKg" type="number" step="0.1" min="0.1" dir="ltr" required />
          </Field>
          <Field label="ترتیب">
            <Input name="sortOrder" type="number" defaultValue={0} dir="ltr" />
          </Field>
          <div className="md:col-span-5 flex items-center justify-end gap-2">
            <input type="hidden" name="specFields" value="[]" />
            {!state.ok && state.error && <span role="alert" className="text-sm text-red-700">{state.error}</span>}
            {state.ok && <span className="text-sm text-emerald-600">{state.message}</span>}
            <Button type="submit" disabled={pending}>{pending ? "…" : "افزودن"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function CategoryCard({ category, childrenCats }: { category: CategorySeed; childrenCats: CategorySeed[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card>
      <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">
            <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} className="flex items-center gap-2 text-right">
              <span className="text-ash">{expanded ? "▾" : "▴"}</span>
              <span>{category.name}</span>
              {category.productCount > 0 && <Badge className="bg-plaster text-ink">{toFaDigits(category.productCount)} محصول</Badge>}
              {category.childCount > 0 && <Badge className="bg-flame-100 text-flame-800">{toFaDigits(category.childCount)} زیردسته</Badge>}
            </button>
          </h2>
          <p className="mt-0.5 text-sm text-ash"><span dir="ltr">{category.slug} • وزن {category.weightKg} kg</span></p>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          <CategoryForm category={category} rootOptions={categoriesRoots(category)} />
          {childrenCats.map((child) => (
            <div key={child.id} className="rounded-card border border-plaster p-3">
              <CategoryForm category={child} rootOptions={categoriesRoots(child)} nested />
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

// parents are fixed once created; only show current parent as the option
function categoriesRoots(cat: CategorySeed): CategorySeed[] {
  return cat.parentId ? [cat] : [];
}

function CategoryForm({ category, rootOptions }: { category: CategorySeed; rootOptions: CategorySeed[]; nested?: boolean }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(saveCategory, idle);
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  const [specFields, setSpecFields] = useState<SpecFieldSeed[]>(category.specFields.map((f) => ({ ...f })));

  const updateField = (i: number, patch: Partial<SpecFieldSeed>) =>
    setSpecFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  return (
    <>
      <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={category.id} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Field label="نام"><Input name="name" defaultValue={category.name} required /></Field>
        <Field label="اسلاگ"><Input name="slug" dir="ltr" defaultValue={category.slug} required /></Field>
        {!category.parentId && (
          <Field label="والد">
            <Select name="parentId" defaultValue="">
              <option value="">— ریشه —</option>
              {rootOptions.filter((r) => r.id === category.id).map((r) => (
                <option key={r.id} value={r.id}>{r.name} (فعلی)</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="وزن (kg)" required><Input name="weightKg" type="number" step="0.1" defaultValue={category.weightKg} dir="ltr" required /></Field>
        <Field label="ترتیب"><Input name="sortOrder" type="number" defaultValue={category.sortOrder} dir="ltr" /></Field>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-ink">فیلدهای مشخصات فنی</p>
        <div className="space-y-2">
          {specFields.map((f, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <Input aria-label={`نام فیلد ${i + 1}`} placeholder="نام فیلد" value={f.name} onChange={(e) => updateField(i, { name: e.target.value })} />
              <Select aria-label={`نوع فیلد ${i + 1}`} value={f.type} onChange={(e) => updateField(i, { type: e.target.value })}>
                <option value="string">متن</option>
                <option value="number">عدد</option>
                <option value="boolean">بله/خیر</option>
                <option value="enum">گزینه‌ای</option>
              </Select>
              <Input aria-label={`واحد فیلد ${i + 1}`} placeholder="واحد" value={f.unit ?? ""} onChange={(e) => updateField(i, { unit: e.target.value })} />
              <div className="flex items-center gap-2 px-1 text-sm text-ink">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
                  <Checkbox checked={f.filterable} onCheckedChange={(c) => updateField(i, { filterable: c === true })} />
                  قابل فیلتر
                </label>
              </div>
              <button type="button" aria-label={`حذف فیلد ${i + 1}`} onClick={() => setSpecFields((fs) => fs.filter((_, idx) => idx !== i))} className="text-sm text-ink hover:text-flame-700">
                حذف
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSpecFields((fs) => [...fs, { name: "", type: "string", unit: "", filterable: true, sortOrder: fs.length }])}
            className="form-control-compact"
          >
            + افزودن فیلد
          </button>
        </div>
        <input type="hidden" name="specFields" value={JSON.stringify(specFields.map((f, i) => ({ id: f.id, name: f.name, type: f.type, unit: f.unit, filterable: f.filterable, sortOrder: i })))} />
      </div>

      <div className="flex items-center justify-end gap-3">
        <span className="flex-1" />
        {!state.ok && state.error && <span role="alert" className="text-sm text-red-700">{state.error}</span>}
        {state.ok && <span className="text-sm text-emerald-600">{state.message}</span>}
        <Button type="submit" disabled={pending}>{pending ? "…" : "ذخیره"}</Button>
      </div>
      </form>
      <div className="mt-3 flex justify-start">
        <DeleteCategoryButton id={category.id} />
      </div>
    </>
  );
}

function DeleteCategoryButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(deleteCategory, idle);
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  return (
    <form action={formAction} onSubmit={(e) => { if (!confirm("حذف این دسته؟")) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>حذف</Button>
      {!state.ok && state.error && <span role="alert" className="mr-2 text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
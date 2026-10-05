"use client";
import { toFaDigits } from "@kmodern/contracts";

// Collections CRUD (004): name/slug/sortOrder + ordered product membership.

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveCollection, deleteCollection } from "@/catalogue/lib/collection-actions";
import { idle, type ActionResult } from "@/lib/actions/result";
import { Button, Card, CardContent, CardHeader, Input } from "@kmodern/ui";
import { Field } from "@/components/panel-ui";

interface ItemSeed {
  productId: string;
  productName?: string;
  sortOrder: number;
}
interface CollectionSeed {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  items: ItemSeed[];
}
interface ProductLite {
  id: string;
  name: string;
}

export function CollectionsManager({ collections, products }: { collections: CollectionSeed[]; products: ProductLite[] }) {
  return (
    <div className="space-y-5">
      <CollectionForm
        seed={{ id: "", name: "", slug: "", sortOrder: 0, items: [] }}
        products={products}
        title="افزودن مجموعه"
      />
      {collections.length === 0 ? (
        <Card><CardContent className="text-sm text-ash">مجموعه‌ای تعریف نشده است</CardContent></Card>
      ) : (
        collections.map((c) => <CollectionCard key={c.id} collection={c} products={products} />)
      )}
    </div>
  );
}

function CollectionCard({ collection, products }: { collection: CollectionSeed; products: ProductLite[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card>
      <CardHeader className="items-start justify-between gap-3 border-b border-plaster px-5 py-4 sm:flex-row sm:gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">
            <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} className="flex items-center gap-2 text-right">
              <span className="text-ash">{expanded ? "▾" : "▴"}</span>
              <span>{collection.name}</span>
              <span className="text-xs font-normal text-ash">{toFaDigits(collection.items.length)} محصول</span>
            </button>
          </h2>
          <p className="mt-0.5 text-sm text-ash"><span dir="ltr">{collection.slug}</span></p>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          <CollectionForm seed={collection} products={products} />
        </CardContent>
      )}
    </Card>
  );
}

function CollectionForm({ seed, products, title }: { seed: CollectionSeed; products: ProductLite[]; title?: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(saveCollection, idle);
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const isEdit = Boolean(seed.id);
  const [name, setName] = useState(seed.name);
  const [slug, setSlug] = useState(seed.slug);
  const [sortOrder, setSortOrder] = useState(seed.sortOrder);
  const [items, setItems] = useState<ItemSeed[]>(seed.items);
  const [picker, setPicker] = useState(products[0]?.id ?? "");

  const hasProduct = (id: string) => items.some((i) => i.productId === id);
  const addItem = () => {
    if (!picker || hasProduct(picker)) return;
    setItems((is) => [...is, { productId: picker, productName: products.find((p) => p.id === picker)?.name, sortOrder: is.length }]);
  };
  const moveItem = (i: number, dir: -1 | 1) =>
    setItems((is) => {
      const j = i + dir;
      if (j < 0 || j >= is.length) return is;
      const copy = [...is];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy.map((it, k) => ({ ...it, sortOrder: k }));
    });

  return (
    <>
      <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={seed.id} />
      {title && <h3 className="text-base font-semibold text-ink">{title}</h3>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="نام" required><Input name="name" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="اسلاگ" required><Input name="slug" value={slug} dir="ltr" onChange={(e) => setSlug(e.target.value)} required /></Field>
        <Field label="ترتیب"><Input name="sortOrder" type="number" value={sortOrder} dir="ltr" onChange={(e) => setSortOrder(Number(e.target.value) || 0)} /></Field>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-ink">محصولات مجموعه</p>
        <div className="mb-2 flex items-center gap-2">
          <select aria-label="انتخاب محصول برای مجموعه" value={picker} onChange={(e) => setPicker(e.target.value)} className="flex-1 form-control">
            {products.filter((p) => !hasProduct(p.id)).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>افزودن</Button>
        </div>
        {items.length > 0 && (
          <ul className="divide-y divide-plaster rounded-card border border-plaster">
            {items.map((it, i) => (
              <li key={it.productId} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{it.productName ?? it.productId}</span>
                <span className="flex items-center gap-1">
                  <button type="button" aria-label={`انتقال محصول ${i + 1} به بالا`} onClick={() => moveItem(i, -1)} className="rounded px-1.5 text-ash hover:bg-plaster" disabled={i === 0}>↑</button>
                  <button type="button" aria-label={`انتقال محصول ${i + 1} به پایین`} onClick={() => moveItem(i, 1)} className="rounded px-1.5 text-ash hover:bg-plaster" disabled={i === items.length - 1}>↓</button>
                  <button type="button" aria-label={`حذف محصول ${i + 1}`} onClick={() => setItems((is) => is.filter((_, k) => k !== i))} className="rounded px-1.5 text-red-700 hover:bg-red-50">حذف</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <input type="hidden" name="items" value={JSON.stringify(items.map((it, i) => ({ productId: it.productId, sortOrder: i })))} />
      </div>

      <div className="flex items-center justify-end gap-3">
        <span className="flex-1" />
        {!state.ok && state.error && <span role="alert" className="text-sm text-red-700">{state.error}</span>}
        {state.ok && <span className="text-sm text-emerald-600">{state.message}</span>}
        <Button type="submit" disabled={pending}>{pending ? "…" : isEdit ? "ذخیره" : "افزودن"}</Button>
      </div>
      </form>
      {isEdit && (
        <div className="mt-3 flex justify-start">
          <DeleteCollectionButton id={seed.id} />
        </div>
      )}
    </>
  );
}

function DeleteCollectionButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(deleteCollection, idle);
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  return (
    <form action={formAction} onSubmit={(e) => { if (!confirm("حذف این مجموعه؟")) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>حذف</Button>
      {!state.ok && state.error && <span role="alert" className="mr-2 text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
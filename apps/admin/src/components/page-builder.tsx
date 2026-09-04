"use client";

// Page-builder editor (005): ordered block list, add/reorder/edit, per-type
// prop forms validated by @kmodern/schema componentSchemas on save. Blocks
// carry {id, type, props}; save draft / publish copies draftBlocks →
// publishedBlocks server-side.

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { componentSchemas } from "@kmodern/schema";
import { savePage } from "@/lib/actions/content";
import type { ActionState } from "@/lib/actions/auth";
import { Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { MediaPickerButton } from "./media-picker-button";

const BLOCK_TYPES = Object.keys(componentSchemas) as Array<keyof typeof componentSchemas>;

const TYPE_LABELS: Record<string, string> = {
  hero: "هیرو (بنر اصلی)",
  productGrid: "شبکه محصولات",
  productSlider: "اسلایدر محصولات",
  richText: "متن غنی",
  banner: "بنر",
  bannerPair: "دو بنر",
  bannerTrio: "سه بنر",
  uspRow: "نوار مزایا",
  categoryTiles: "کاشی دسته‌بندی",
  spacer: "فاصله‌گذار",
  imageTextSplit: "تصویر و متن",
  slidingStrip: "نوار متحرک",
  testimonials: "نظرات مشتریان",
  faqAccordion: "سوالات متداول",
  video: "ویدیو",
  countdown: "شمارش معکوس",
  blogTeaser: "تازه‌های وبلاگ",
  trustBadges: "نشان‌های اعتماد",
  newsletter: "خبرنامه",
  statsRow: "آمار و ارقام",
  comparisonTable: "جدول مقایسه",
  beforeAfter: "قبل و بعد",
  map: "نقشه",
  customHtml: "HTML سفارشی",
};

type FieldKind = "text" | "textarea" | "number" | "checkbox" | "select" | "json" | "media";
interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  options?: string[];
}

const BLOCK_FIELDS: Record<string, FieldDef[]> = {
  hero: [
    { key: "title", label: "عنوان", kind: "text" },
    { key: "subtitle", label: "زیرعنوان", kind: "text" },
    { key: "image", label: "تصویر", kind: "media" },
  ],
  productGrid: [
    { key: "title", label: "عنوان", kind: "text" },
    { key: "limit", label: "تعداد", kind: "number" },
  ],
  productSlider: [
    { key: "title", label: "عنوان", kind: "text" },
    { key: "limit", label: "تعداد", kind: "number" },
    { key: "autoplay", label: "پخش خودکار", kind: "checkbox" },
    { key: "intervalMs", label: "فاصله (میلی‌ثانیه)", kind: "number" },
  ],
  richText: [{ key: "html", label: "HTML", kind: "textarea" }],
  banner: [
    { key: "title", label: "عنوان", kind: "text" },
    { key: "subtitle", label: "زیرعنوان", kind: "text" },
    { key: "image", label: "تصویر", kind: "media" },
  ],
  bannerPair: [{ key: "banners", label: "بنرها (آرایه JSON)", kind: "json" }],
  bannerTrio: [{ key: "banners", label: "بنرها (آرایه JSON)", kind: "json" }],
  uspRow: [{ key: "items", label: "مزایا (آرایه JSON)", kind: "json" }],
  categoryTiles: [
    { key: "title", label: "عنوان", kind: "text" },
    { key: "categories", label: "دسته‌ها (آرایه JSON)", kind: "json" },
  ],
  spacer: [{ key: "height", label: "ارتفاع (px)", kind: "number" }],
  imageTextSplit: [
    { key: "title", label: "عنوان", kind: "text" },
    { key: "text", label: "متن", kind: "textarea" },
    { key: "imageSide", label: "سمت تصویر", kind: "select", options: ["LEFT", "RIGHT"] },
  ],
  slidingStrip: [
    { key: "items", label: "عبارت‌ها (آرایه JSON)", kind: "json" },
    { key: "speed", label: "سرعت", kind: "select", options: ["slow", "normal", "fast"] },
  ],
  testimonials: [
    { key: "title", label: "عنوان", kind: "text" },
    { key: "items", label: "نظرات (آرایه JSON)", kind: "json" },
  ],
  faqAccordion: [
    { key: "title", label: "عنوان", kind: "text" },
    { key: "items", label: "سوالات (آرایه JSON)", kind: "json" },
  ],
  video: [
    { key: "provider", label: "پلتفرم", kind: "select", options: ["APARAT", "YOUTUBE"] },
    { key: "url", label: "آدرس ویدیو", kind: "text" },
    { key: "title", label: "عنوان", kind: "text" },
    { key: "thumbnail", label: "تصویر بندانگشتی", kind: "media" },
  ],
  countdown: [
    { key: "title", label: "عنوان", kind: "text" },
    { key: "endsAt", label: "پایان (ISO)", kind: "text" },
  ],
  blogTeaser: [
    { key: "title", label: "عنوان", kind: "text" },
    { key: "tagId", label: "شناسه تگ", kind: "text" },
    { key: "limit", label: "تعداد", kind: "number" },
  ],
  trustBadges: [{ key: "items", label: "نشان‌ها (آرایه JSON)", kind: "json" }],
  newsletter: [
    { key: "title", label: "عنوان", kind: "text" },
    { key: "subtitle", label: "زیرعنوان", kind: "text" },
  ],
  statsRow: [{ key: "items", label: "آمار (آرایه JSON)", kind: "json" }],
  comparisonTable: [
    { key: "title", label: "عنوان", kind: "text" },
    { key: "categoryId", label: "شناسه دسته", kind: "text" },
    { key: "productIds", label: "محصولات (آرایه JSON)", kind: "json" },
  ],
  beforeAfter: [
    { key: "before", label: "تصویر قبل (JSON)", kind: "json" },
    { key: "after", label: "تصویر بعد (JSON)", kind: "json" },
  ],
  map: [
    { key: "provider", label: "سرویس", kind: "select", options: ["NESHAN", "BALAD"] },
    { key: "embedUrl", label: "آدرس Embed", kind: "text" },
    { key: "title", label: "عنوان", kind: "text" },
  ],
  customHtml: [{ key: "html", label: "HTML", kind: "textarea" }],
};

interface BlockState {
  id: string;
  type: keyof typeof componentSchemas;
  props: Record<string, unknown>;
}

export interface PageSeed {
  id?: string;
  title: string;
  slug: string;
  kind?: string;
  status?: string;
  blocks: BlockState[];
  seo: Record<string, unknown>;
}

export function PageBuilder({ page }: { page: PageSeed }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(savePage, {});
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const [blocks, setBlocks] = useState<BlockState[]>(page.blocks);
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const isSystem = page.kind === "SYSTEM";
  const [addType, setAddType] = useState<string>(BLOCK_TYPES[0]);

  const addBlock = () => {
    const type = addType as keyof typeof componentSchemas;
    const schema = componentSchemas[type];
    const parsed = schema.safeParse({});
    const props = parsed.success ? (parsed.data as Record<string, unknown>) : {};
    setBlocks((bs) => [...bs, { id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, props }]);
  };

  const move = (i: number, dir: -1 | 1) =>
    setBlocks((bs) => {
      const j = i + dir;
      if (j < 0 || j >= bs.length) return bs;
      const copy = [...bs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const updateProps = (i: number, patch: Record<string, unknown>) =>
    setBlocks((bs) => bs.map((b, idx) => (idx === i ? { ...b, props: { ...b.props, ...patch } } : b)));

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={page.id ?? ""} />
      <input type="hidden" name="action" value="draft" />
      <div className="space-y-4">
        <Card>
          <CardHeader title="مشخصات صفحه" />
          <CardBody>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="عنوان">
                <Input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={isSystem} />
              </Field>
              <Field label="اسلاگ">
                <Input name="slug" value={slug} dir="ltr" onChange={(e) => setSlug(e.target.value)} required disabled={isSystem} />
              </Field>
            </div>
            <input type="hidden" name="status" value={page.status ?? "DRAFT"} />
            <input type="hidden" name="seo" value={JSON.stringify(page.seo)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="بلوک‌های صفحه" subtitle={`${blocks.length} بلوک — با افزودن بلوک شروع کنید`} />
          <CardBody>
            <div className="mb-4 flex items-center gap-2">
              <Select value={addType} onChange={(e) => setAddType(e.target.value)} className="max-w-xs">
                {BLOCK_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>
                ))}
              </Select>
              <Button type="button" variant="secondary" onClick={addBlock}>+ افزودن بلوک</Button>
            </div>

            <div className="space-y-3">
              {blocks.map((b, i) => (
                <BlockCard
                  key={b.id}
                  block={b}
                  index={i}
                  total={blocks.length}
                  onChange={(patch) => updateProps(i, patch)}
                  onRemove={() => setBlocks((bs) => bs.filter((_, idx) => idx !== i))}
                  onMove={(dir) => move(i, dir)}
                />
              ))}
              {blocks.length === 0 && (
                <p className="rounded-card border border-dashed border-fog py-8 text-center text-sm text-ash">
                  هنوز بلوکی اضافه نشده است
                </p>
              )}
            </div>
            <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
          </CardBody>
        </Card>

        {state.error && <p className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        {state.ok && <p className="rounded-card bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.message}</p>}

        <div className="sticky bottom-4 flex justify-end gap-3">
          <Button type="submit" name="action" value="draft" disabled={pending}>ذخیره پیش‌نویس</Button>
          <Button type="submit" name="action" value="publish" disabled={pending}>
            {pending ? "…" : "انتشار"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function BlockCard({
  block,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  block: BlockState;
  index: number;
  total: number;
  onChange: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(index === total - 1 && total === 1);
  const fields = BLOCK_FIELDS[block.type] ?? [];
  const [props, setProps] = useState(block.props);
  const [jsonDraft, setJsonDraft] = useState(JSON.stringify(block.props, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const summary = typeof props.title === "string" && props.title ? props.title : "";

  const applyProps = (next: Record<string, unknown>) => {
    setProps(next);
    setJsonDraft(JSON.stringify(next, null, 2));
    onChange(next);
  };

  const setField = (key: string, value: unknown) => applyProps({ ...props, [key]: value });

  const setJsonField = (key: string, raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      setField(key, parsed);
    } catch {
      setJsonError(`JSON نامعتبر برای ${key}`);
    }
  };

  const setWholeJson = (raw: string) => {
    setJsonDraft(raw);
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      setJsonError(null);
      setProps(parsed);
      onChange(parsed);
    } catch {
      setJsonError("JSON نامعتبر است");
    }
  };

  return (
    <div className="rounded-card border border-plaster bg-plaster/50">
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-ash">{open ? "▾" : "▴"}</button>
        <span className="rounded bg-ink px-2 py-0.5 text-xs font-medium text-white">{TYPE_LABELS[block.type] ?? block.type}</span>
        {summary && <span className="text-sm text-ash">{summary}</span>}
        <span className="flex-1" />
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="rounded px-1.5 text-ash hover:bg-plaster disabled:opacity-30">↑</button>
        <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className="rounded px-1.5 text-ash hover:bg-plaster disabled:opacity-30">↓</button>
        <button type="button" onClick={onRemove} className="rounded px-1.5 text-red-600 hover:bg-red-50">حذف</button>
      </div>
      {open && (
        <div className="border-t border-plaster p-4">
          <div className="mb-3 text-xs font-semibold text-ash">مشترک</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="anchorId"><Input value={(props.anchorId as string) ?? ""} onChange={(e) => setField("anchorId", e.target.value)} /></Field>
            <Field label="padding">
              <Select value={(props.padding as string) ?? "md"} onChange={(e) => setField("padding", e.target.value)}>
                <option value="none">بدون</option>
                <option value="sm">کم</option>
                <option value="md">متوسط</option>
                <option value="lg">زیاد</option>
              </Select>
            </Field>
            <Field label="پس‌زمینه"><Input value={(props.background as string) ?? ""} onChange={(e) => setField("background", e.target.value)} /></Field>
            <div className="flex items-end gap-3 pb-1">
              <Checkbox label="نمایش" checked={props.visible !== false} onChange={(e) => setField("visible", e.target.checked)} />
              <Checkbox label="موبایل" checked={props.mobileVisible !== false} onChange={(e) => setField("mobileVisible", e.target.checked)} />
            </div>
          </div>

          <div className="mb-3 mt-4 text-xs font-semibold text-ash">ویژهٔ بلوک</div>
          <div className="grid grid-cols-2 gap-3">
            {fields.map((f) => (
              <Field key={f.key} label={f.label} className={f.kind === "json" || f.kind === "textarea" ? "col-span-2" : undefined}>
                {f.kind === "text" && <Input value={(props[f.key] as string) ?? ""} dir="ltr" onChange={(e) => setField(f.key, e.target.value)} />}
                {f.kind === "media" && (
                  <div className="flex items-center gap-2">
                    <Input
                      value={((props[f.key] as { src?: string } | undefined)?.src) ?? ""}
                      dir="ltr"
                      onChange={(e) => setField(f.key, { ...(props[f.key] as object), src: e.target.value })}
                    />
                    <MediaPickerButton
                      onPick={(url) => setField(f.key, { ...(props[f.key] as object), src: url })}
                    />
                  </div>
                )}
                {f.kind === "number" && <Input type="number" value={(props[f.key] as number) ?? 0} dir="ltr" onChange={(e) => setField(f.key, Number(e.target.value) || 0)} />}
                {f.kind === "textarea" && <Textarea value={(props[f.key] as string) ?? ""} onChange={(e) => setField(f.key, e.target.value)} />}
                {f.kind === "checkbox" && <Checkbox label={f.label} checked={props[f.key] !== false} onChange={(e) => setField(f.key, e.target.checked)} />}
                {f.kind === "select" && (
                  <Select value={(props[f.key] as string) ?? f.options?.[0] ?? ""} onChange={(e) => setField(f.key, e.target.value)}>
                    {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </Select>
                )}
                {f.kind === "json" && (
                  <Textarea
                    className="min-h-[90px] font-mono text-xs"
                    dir="ltr"
                    value={JSON.stringify(props[f.key] ?? null, null, 2)}
                    onChange={(e) => setJsonField(f.key, e.target.value)}
                  />
                )}
              </Field>
            ))}
          </div>

          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold text-ash">props کامل (JSON — برای فیلدهای پیشرفته: لینک، تصویر، منبع)</p>
            <Textarea className="min-h-[120px] font-mono text-xs" dir="ltr" value={jsonDraft} onChange={(e) => setWholeJson(e.target.value)} />
            {jsonError && <p className="mt-1 text-xs text-red-600">{jsonError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
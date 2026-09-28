"use client";

// Blog post editor (007) — TipTap-style JSON doc, no library. Renders a
// node list (paragraphs, headings, lists, quotes, images, hr) plus the five
// embed node types (productCard, productGrid, imageGallery, video, callout),
// serialized to {type:"doc", content:[...]} and validated against
// postBodySchema on save.

import { useActionState, useEffect, useState } from "react";
import { savePost } from "@/lib/actions/post-actions";
import { idle, type ActionResult } from "@/lib/actions/result";
import { Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { MediaPickerButton } from "./media-picker-button";

type EmbedKind = "productCard" | "productGrid" | "imageGallery" | "video" | "callout";

type NodeState =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "bulletList"; items: string[] }
  | { kind: "orderedList"; items: string[] }
  | { kind: "blockquote"; text: string }
  | { kind: "image"; src: string; alt: string }
  | { kind: "horizontalRule" }
  | { kind: "productCard"; productId: string }
  | { kind: "productGrid"; mode: "COLLECTION" | "PRODUCTS"; collectionId: string; productIds: string[] }
  | { kind: "imageGallery"; images: Array<{ src: string; alt: string }> }
  | { kind: "video"; provider: "APARAT" | "YOUTUBE"; url: string }
  | { kind: "callout"; calloutKind: "tip" | "warning" | "note"; text: string };

const NODE_LABELS: Record<string, string> = {
  paragraph: "پاراگراف",
  heading: "عنوان",
  bulletList: "لیست گلوله‌ای",
  orderedList: "لیست شماره‌دار",
  blockquote: "نقل قول",
  image: "تصویر",
  horizontalRule: "خط جداکننده",
  productCard: "کارت محصول",
  productGrid: "شبکه محصولات",
  imageGallery: "گالری تصاویر",
  video: "ویدیو",
  callout: "جعبه اطلاع‌رسانی",
};

export interface PostSeed {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string;
  byline: string;
  status: string;
  featured: boolean;
  commentsEnabled: boolean;
  publishAt: string;
  tags: string[];
  seo: Record<string, unknown>;
  body: { type: string; content?: unknown[] };
}

function nodeFromJson(node: Record<string, unknown>): NodeState {
  const type = node.type as string;
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  const text = extractText(node);
  switch (type) {
    case "heading":
      return { kind: "heading", level: Number(attrs.level) || 2, text };
    case "bulletList":
      return { kind: "bulletList", items: listItems(node) };
    case "orderedList":
      return { kind: "orderedList", items: listItems(node) };
    case "blockquote":
      return { kind: "blockquote", text: extractText((node.content as unknown[])?.[0]) };
    case "image":
      return { kind: "image", src: String(attrs.src ?? ""), alt: String(attrs.alt ?? "") };
    case "horizontalRule":
      return { kind: "horizontalRule" };
    case "productCard":
      return { kind: "productCard", productId: String(attrs.productId ?? "") };
    case "productGrid": {
      const source = attrs.source as Record<string, unknown> | undefined;
      return {
        kind: "productGrid",
        mode: source?.kind === "PRODUCTS" ? "PRODUCTS" : "COLLECTION",
        collectionId: source?.kind === "COLLECTION" ? String(source.collectionId ?? "") : "",
        productIds: source?.kind === "PRODUCTS" ? String((source.productIds as string[] | undefined) ?? []) .split(",") : [],
      };
    }
    case "imageGallery":
      return {
        kind: "imageGallery",
        images: ((attrs.images as Array<{ src?: string; alt?: string }>) ?? []).map((im) => ({
          src: String(im.src ?? ""),
          alt: String(im.alt ?? ""),
        })),
      };
    case "video":
      return { kind: "video", provider: attrs.provider === "YOUTUBE" ? "YOUTUBE" : "APARAT", url: String(attrs.url ?? "") };
    case "callout":
      return {
        kind: "callout",
        calloutKind: attrs.kind === "warning" || attrs.kind === "note" ? attrs.kind : "tip",
        text: String(attrs.text ?? ""),
      };
    default:
      return { kind: "paragraph", text };
  }
}

function extractText(node: unknown): string {
  const n = node as { text?: string; content?: unknown[] } | undefined;
  if (!n) return "";
  if (n.text) return n.text;
  const parts: string[] = [];
  for (const child of n.content ?? []) {
    const t = extractText(child);
    if (t) parts.push(t);
  }
  return parts.join("");
}

function listItems(node: Record<string, unknown>): string[] {
  const items = (node.content as unknown[]) ?? [];
  return items.map((it) => extractText(it).trim()).filter(Boolean);
}

function nodeToJson(n: NodeState): Record<string, unknown> {
  const textNode = (t: string) => ({ type: "text", text: t });
  const paragraph = (t: string) => ({ type: "paragraph", content: [textNode(t)] });
  switch (n.kind) {
    case "paragraph":
      return n.text ? { type: "paragraph", content: [textNode(n.text)] } : { type: "paragraph" };
    case "heading":
      return { type: "heading", attrs: { level: n.level }, content: [textNode(n.text)] };
    case "bulletList":
    case "orderedList":
      return { type: n.kind, content: n.items.map((t) => ({ type: "listItem", content: [paragraph(t)] })) };
    case "blockquote":
      return { type: "blockquote", content: [paragraph(n.text)] };
    case "image":
      return { type: "image", attrs: { src: n.src, alt: n.alt } };
    case "horizontalRule":
      return { type: "horizontalRule" };
    case "productCard":
      return { type: "productCard", attrs: { productId: n.productId } };
    case "productGrid":
      return {
        type: "productGrid",
        attrs: {
          source:
            n.mode === "PRODUCTS"
              ? { kind: "PRODUCTS", productIds: n.productIds }
              : { kind: "COLLECTION", collectionId: n.collectionId },
        },
      };
    case "imageGallery":
      return { type: "imageGallery", attrs: { images: n.images.map((im) => ({ src: im.src, alt: im.alt })) } };
    case "video":
      return { type: "video", attrs: { provider: n.provider, url: n.url } };
    case "callout":
      return { type: "callout", attrs: { kind: n.calloutKind, text: n.text } };
  }
}

export function BlogEditor({ post, products, collections }: { post: PostSeed; products: Array<{ id: string; name: string }>; collections: Array<{ id: string; name: string }> }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(savePost, idle);
  const [title, setTitle] = useState(post.title);
  const [slug, setSlug] = useState(post.slug);
  const [excerpt, setExcerpt] = useState(post.excerpt);
  const [coverImage, setCoverImage] = useState(post.coverImage);
  const [byline, setByline] = useState(post.byline);
  const [status, setStatus] = useState(post.status || "DRAFT");
  const [featured, setFeatured] = useState(post.featured);
  const [commentsEnabled, setCommentsEnabled] = useState(post.commentsEnabled);
  const [publishAt, setPublishAt] = useState(post.publishAt);
  const [tags, setTags] = useState(post.tags.join("، "));
  const [seo, setSeo] = useState({
    title: (post.seo.title as string) ?? "",
    description: (post.seo.description as string) ?? "",
    ogImage: (post.seo.ogImage as string) ?? "",
    canonical: (post.seo.canonical as string) ?? "",
    noindex: Boolean(post.seo.noindex),
    robots: (post.seo.robots as string) ?? "index, follow",
  });
  const [nodes, setNodes] = useState<NodeState[]>(() =>
    (post.body.content ?? []).map((n) => nodeFromJson(n as Record<string, unknown>)),
  );
  const [addKind, setAddKind] = useState<string>("paragraph");

  const addNode = () => {
    const fresh = (): NodeState => {
      switch (addKind) {
        case "heading":
          return { kind: "heading", level: 2, text: "" };
        case "bulletList":
          return { kind: "bulletList", items: [""] };
        case "orderedList":
          return { kind: "orderedList", items: [""] };
        case "imageGallery":
          return { kind: "imageGallery", images: [{ src: "", alt: "" }] };
        case "productGrid":
          return { kind: "productGrid", mode: "COLLECTION", collectionId: collections[0]?.id ?? "", productIds: [] };
        case "callout":
          return { kind: "callout", calloutKind: "tip", text: "" };
        case "paragraph":
          return { kind: "paragraph", text: "" };
        case "blockquote":
          return { kind: "blockquote", text: "" };
        case "image":
          return { kind: "image", src: "", alt: "" };
        case "productCard":
          return { kind: "productCard", productId: "" };
        case "video":
          return { kind: "video", provider: "APARAT", url: "" };
        default:
          return { kind: "horizontalRule" };
      }
    };
    setNodes((ns) => [...ns, fresh()]);
  };

  const updateNode = (i: number, patch: Partial<NodeState>) =>
    setNodes((ns) => ns.map((n, idx) => (idx === i ? ({ ...n, ...patch } as NodeState) : n)));

  const moveNode = (i: number, dir: -1 | 1) =>
    setNodes((ns) => {
      const j = i + dir;
      if (j < 0 || j >= ns.length) return ns;
      const copy = [...ns];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={post.id ?? ""} />
      <input type="hidden" name="body" value={JSON.stringify({ type: "doc", content: nodes.map(nodeToJson) })} />
      <input type="hidden" name="tags" value={JSON.stringify(tags.split(/[،,]/).map((tag) => tag.trim()).filter(Boolean))} />

      <Card>
        <CardHeader title="مشخصات پست" />
        <CardBody>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="عنوان" required><Input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required /></Field>
            <Field label="اسلاگ" required><Input name="slug" value={slug} dir="ltr" onChange={(e) => setSlug(e.target.value)} required /></Field>
            <Field label="خلاصه (اکسرپت)"><Textarea name="excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} /></Field>
            <Field label="تصویر کاور">
              <div className="flex items-center gap-2">
                <Input name="coverImage" value={coverImage} dir="ltr" onChange={(e) => setCoverImage(e.target.value)} />
                <MediaPickerButton onPick={setCoverImage} />
              </div>
            </Field>
            <Field label="نویسنده/امضا"><Input name="byline" value={byline} onChange={(e) => setByline(e.target.value)} /></Field>
            <Field label="وضعیت">
              <Select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="DRAFT">پیش‌نویس</option>
                <option value="PUBLISHED">منتشر شده</option>
                <option value="ARCHIVED">بایگانی</option>
              </Select>
            </Field>
            <Field label="انتشار در (اختیاری)">
              <Input type="datetime-local" name="publishAt" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
            </Field>
            <Field label="برچسب‌ها (با ویرگول جدا کنید)">
              <Input name="tagsText" value={tags} onChange={(e) => setTags(e.target.value)} />
            </Field>
            <div className="flex items-end gap-4 pb-1">
              <Checkbox label="ویژه" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
              <Checkbox label="فعال بودن نظرات" checked={commentsEnabled} onChange={(e) => setCommentsEnabled(e.target.checked)} />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="بدنهٔ نوشته" subtitle="پاراگراف، عنوان، لیست، تصویر و بلوک‌های جاسازی‌شده" />
        <CardBody>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Select value={addKind} onChange={(e) => setAddKind(e.target.value)} className="max-w-48">
              {Object.keys(NODE_LABELS).map((k) => (
                <option key={k} value={k}>{NODE_LABELS[k]}</option>
              ))}
            </Select>
            <Button type="button" variant="secondary" onClick={addNode}>+ افزودن بند</Button>
          </div>

          <div className="space-y-3">
            {nodes.map((n, i) => (
              <NodeCard key={i} node={n} index={i} total={nodes.length} products={products} collections={collections}
                onChange={(patch) => updateNode(i, patch)} onRemove={() => setNodes((ns) => ns.filter((_, idx) => idx !== i))}
                onMove={(dir) => moveNode(i, dir)} />
            ))}
            {nodes.length === 0 && (
              <p className="rounded-card border border-dashed border-fog py-8 text-center text-sm text-ash">
                هنوز بندی اضافه نشده است
              </p>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="بهینه‌سازی (SEO)" />
        <CardBody>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="عنوان"><Input value={seo.title} maxLength={70} onChange={(e) => setSeo({ ...seo, title: e.target.value })} /></Field>
            <Field label="توضیح"><Input value={seo.description} maxLength={160} onChange={(e) => setSeo({ ...seo, description: e.target.value })} /></Field>
            <Field label="تصویر OG"><Input value={seo.ogImage} dir="ltr" onChange={(e) => setSeo({ ...seo, ogImage: e.target.value })} /></Field>
            <Field label="URL متعارف"><Input value={seo.canonical} dir="ltr" onChange={(e) => setSeo({ ...seo, canonical: e.target.value })} /></Field>
            <Field label="robots"><Input value={seo.robots} dir="ltr" onChange={(e) => setSeo({ ...seo, robots: e.target.value })} /></Field>
            <div className="flex items-end pb-2"><Checkbox label="noindex" checked={seo.noindex} onChange={(e) => setSeo({ ...seo, noindex: e.target.checked })} /></div>
          </div>
          <input type="hidden" name="seo" value={JSON.stringify(seo)} />
        </CardBody>
      </Card>

      {!state.ok && <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? "در حال ذخیره…" : "ذخیره پست"}</Button>
      </div>
    </form>
  );
}

function NodeCard({
  node,
  index,
  total,
  products,
  collections,
  onChange,
  onRemove,
  onMove,
}: {
  node: NodeState;
  index: number;
  total: number;
  products: Array<{ id: string; name: string }>;
  collections: Array<{ id: string; name: string }>;
  onChange: (patch: Partial<NodeState>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="rounded-card border border-plaster bg-plaster/50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-ink px-2 py-0.5 text-xs font-medium text-white">{NODE_LABELS[node.kind]}</span>
        <span className="flex-1" />
        <button type="button" aria-label="انتقال بند به بالا" onClick={() => onMove(-1)} disabled={index === 0} className="rounded px-1.5 text-ash hover:bg-plaster disabled:opacity-30">↑</button>
        <button type="button" aria-label="انتقال بند به پایین" onClick={() => onMove(1)} disabled={index === total - 1} className="rounded px-1.5 text-ash hover:bg-plaster disabled:opacity-30">↓</button>
        <button type="button" aria-label={`حذف ${NODE_LABELS[node.kind]}`} onClick={onRemove} className="rounded px-1.5 text-red-600 hover:bg-red-50">حذف</button>
      </div>

      {node.kind === "paragraph" && <Input value={node.text} onChange={(e) => onChange({ text: e.target.value })} />}
      {node.kind === "heading" && (
        <div className="flex gap-2">
          <Select value={node.level} onChange={(e) => onChange({ level: Number(e.target.value) })} className="w-24">
            {[1, 2, 3, 4, 5, 6].map((l) => <option key={l} value={l}>H{l}</option>)}
          </Select>
          <Input value={node.text} onChange={(e) => onChange({ text: e.target.value })} />
        </div>
      )}
      {(node.kind === "bulletList" || node.kind === "orderedList") && (
        <div className="space-y-1.5">
          {node.items.map((it, k) => (
            <div key={k} className="flex gap-1.5">
              <Input value={it} onChange={(e) => onChange({ items: node.items.map((x, xk) => (xk === k ? e.target.value : x)) })} />
              <button type="button" aria-label="حذف مورد" onClick={() => onChange({ items: node.items.filter((_, xk) => xk !== k) })} className="text-sm text-red-600">−</button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={() => onChange({ items: [...node.items, ""] })}>+ مورد</Button>
        </div>
      )}
      {node.kind === "blockquote" && <Textarea value={node.text} onChange={(e) => onChange({ text: e.target.value })} />}
      {node.kind === "image" && (
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="آدرس تصویر" dir="ltr" value={node.src} onChange={(e) => onChange({ src: e.target.value })} />
          <Input placeholder="متن جایگزین" value={node.alt} onChange={(e) => onChange({ alt: e.target.value })} />
        </div>
      )}
      {node.kind === "horizontalRule" && <p className="text-xs text-ash">خط افقی — پیش‌نمایشی ندارد</p>}
      {node.kind === "productCard" && (
        <Select value={node.productId} onChange={(e) => onChange({ productId: e.target.value })}>
          <option value="" disabled>انتخاب محصول…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      )}
      {node.kind === "productGrid" && (
        <div className="space-y-2">
          <Select value={node.mode} onChange={(e) => onChange({ mode: e.target.value as "COLLECTION" | "PRODUCTS" })}>
            <option value="COLLECTION">از مجموعه</option>
            <option value="PRODUCTS">محصولات خاص</option>
          </Select>
          {node.mode === "COLLECTION" ? (
            <Select value={node.collectionId} onChange={(e) => onChange({ collectionId: e.target.value })}>
              <option value="" disabled>انتخاب مجموعه…</option>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          ) : (
            <Input
              placeholder="شناسه‌های محصول (با کاما)"
              dir="ltr"
              value={node.productIds.join(",")}
              onChange={(e) => onChange({ productIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            />
          )}
        </div>
      )}
      {node.kind === "imageGallery" && (
        <div className="space-y-1.5">
          {node.images.map((im, k) => (
            <div key={k} className="flex gap-1.5">
              <Input placeholder="آدرس تصویر" dir="ltr" value={im.src} onChange={(e) => onChange({ images: node.images.map((x, xk) => (xk === k ? { ...x, src: e.target.value } : x)) })} />
              <Input placeholder="متن جایگزین" value={im.alt} onChange={(e) => onChange({ images: node.images.map((x, xk) => (xk === k ? { ...x, alt: e.target.value } : x)) })} />
              <button type="button" aria-label="حذف تصویر" onClick={() => onChange({ images: node.images.filter((_, xk) => xk !== k) })} className="text-sm text-red-600">−</button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={() => onChange({ images: [...node.images, { src: "", alt: "" }] })}>+ تصویر</Button>
        </div>
      )}
      {node.kind === "video" && (
        <div className="grid grid-cols-2 gap-2">
          <Select value={node.provider} onChange={(e) => onChange({ provider: e.target.value as "APARAT" | "YOUTUBE" })}>
            <option value="APARAT">آپارات</option>
            <option value="YOUTUBE">یوتیوب</option>
          </Select>
          <Input placeholder="آدرس ویدیو" dir="ltr" value={node.url} onChange={(e) => onChange({ url: e.target.value })} />
        </div>
      )}
      {node.kind === "callout" && (
        <div className="space-y-2">
          <Select value={node.calloutKind} onChange={(e) => onChange({ calloutKind: e.target.value as "tip" | "warning" | "note" })}>
            <option value="tip">نکته</option>
            <option value="warning">هشدار</option>
            <option value="note">یادداشت</option>
          </Select>
          <Textarea value={node.text} onChange={(e) => onChange({ text: e.target.value })} />
        </div>
      )}
    </div>
  );
}
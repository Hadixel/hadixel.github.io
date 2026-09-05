import Image from "next/image";
import Link from "next/link";
import { db } from "@kmodern/db";

// 007 blog body renderer: TipTap-style doc JSON with embed nodes.
type Node = { type?: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> };

export default async function PostBody({ body }: { body: unknown }) {
  const doc = (Array.isArray(body) ? { content: body } : body) as { content?: Node[] };
  if (!doc.content) return null;
  return (
    <div className="space-y-4 leading-8 text-ink">
      {doc.content.map((node, i) => (
        <NodeRenderer key={i} node={node} />
      ))}
    </div>
  );
}

async function NodeRenderer({ node }: { node: Node }) {
  switch (node.type) {
    case "paragraph":
      return <p>{node.content?.map((n, i) => <Inline key={i} node={n} />)}</p>;
    case "heading":
      return node.attrs?.level === 1 || node.attrs?.level === 2 ? (
        <h2 className="pt-4 text-2xl font-bold">{node.content?.map((n, i) => <Inline key={i} node={n} />)}</h2>
      ) : (
        <h3 className="pt-3 text-xl font-bold">{node.content?.map((n, i) => <Inline key={i} node={n} />)}</h3>
      );
    case "bulletList":
      return (
        <ul className="list-disc space-y-1 pr-6">
          {node.content?.map((li, i) => (
            <li key={i}>{li.content?.map((n, j) => <Inline key={j} node={n} />)}</li>
          ))}
        </ul>
      );
    case "orderedList":
      return (
        <ol className="list-decimal space-y-1 pr-6">
          {node.content?.map((li, i) => (
            <li key={i}>{li.content?.map((n, j) => <Inline key={j} node={n} />)}</li>
          ))}
        </ol>
      );
    case "quote":
      return <blockquote className="border-r-4 border-flame-300 pr-4 text-ash italic">{node.content?.map((n, i) => <Inline key={i} node={n} />)}</blockquote>;
    case "codeBlock":
      return <pre className="overflow-x-auto rounded-lg bg-ink p-4 text-sm text-green-200" dir="ltr"><code>{node.content?.map((n) => n.text ?? "").join("")}</code></pre>;
    case "image":
      return <Image src={node.attrs?.src as string} alt={(node.attrs?.alt as string) ?? ""} width={800} height={500} className="my-6 w-full rounded-card object-cover" />;
    case "horizontalRule":
      return <hr className="my-6" />;

    // ---- embed nodes (007) ----
    case "productCard": {
      const pid = node.attrs?.productId as string;
      const p = pid ? await db().product.findUnique({ where: { id: pid }, include: { variants: { orderBy: { price: "asc" } } } }) : null;
      if (!p) return null;
      return (
        <Link href={`/product/${p.slug}`} className="my-6 flex items-center gap-4 rounded-xl border p-4 transition hover:shadow">
          {p.variants[0]?.images?.[0] && <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-plaster"><Image src={p.variants[0].images[0]} alt={p.name} fill sizes="64px" className="object-contain" /></div>}
          <div>
            <div className="font-semibold">{p.name}</div>
            <div className="text-sm text-flame-700">مشاهده محصول</div>
          </div>
        </Link>
      );
    }
    case "imageGallery": {
      const images = (node.attrs?.images as Array<{ src: string; alt?: string }>) ?? [];
      return (
        <div className="my-6 grid grid-cols-2 gap-2 md:grid-cols-3">
          {images.map((img, i) => (
            <Image key={i} src={img.src} alt={img.alt ?? ""} width={400} height={300} className="rounded-lg object-cover" />
          ))}
        </div>
      );
    }
    case "video":
      return (
        <div className="my-6 aspect-video overflow-hidden rounded-card bg-ink">
          <video controls className="h-full w-full">
            <source src={node.attrs?.url as string} />
          </video>
        </div>
      );
    case "callout": {
      const kind = node.attrs?.kind as string;
      const cls = kind === "warning" ? "border-red-200 bg-red-50 text-red-700" : kind === "tip" ? "border-green-200 bg-green-50 text-green-700" : "border-blue-200 bg-blue-50 text-blue-700";
      return <div className={`my-4 rounded-xl border px-4 py-3 text-sm ${cls}`}>{node.attrs?.text as string}</div>;
    }
    default:
      return null;
  }
}

function Inline({ node }: { node: Node }) {
  const text = node.text ?? "";
  if (node.type === "text") {
    let el: React.ReactNode = text;
    if (node.marks?.some((m) => m.type === "bold")) el = <strong>{el}</strong>;
    if (node.marks?.some((m) => m.type === "italic")) el = <em>{el}</em>;
    if (node.marks?.some((m) => m.type === "code")) el = <code className="rounded bg-plaster px-1 text-sm">{el}</code>;
    const link = node.marks?.find((m) => m.type === "link");
    if (link?.attrs?.href) el = <a href={link.attrs.href as string} className="text-flame-700 underline">{el}</a>;
    return <>{el}</>;
  }
  return null;
}
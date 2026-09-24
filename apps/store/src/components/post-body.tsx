import Image from "next/image";
import Link from "next/link";
import { db } from "@kmodern/db";

type Node = { type?: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> };

export default async function PostBody({ body }: { body: unknown }) {
  const doc = (Array.isArray(body) ? { content: body } : body) as { content?: Node[] };
  if (!doc.content) return null;
  return (
    <div className="space-y-6 leading-8 text-ink">
      {doc.content.map((node, index) => <NodeRenderer key={index} node={node} />)}
    </div>
  );
}

async function NodeRenderer({ node }: { node: Node }) {
  switch (node.type) {
    case "paragraph":
      return <p className="text-[15px] leading-9 text-charcoal">{node.content?.map((child, index) => <Inline key={index} node={child} />)}</p>;
    case "heading":
      return node.attrs?.level === 1 || node.attrs?.level === 2 ? (
        <h2 className="pt-5 font-display text-2xl font-black leading-tight text-ink">{node.content?.map((child, index) => <Inline key={index} node={child} />)}</h2>
      ) : (
        <h3 className="pt-3 font-display text-xl font-black leading-tight text-ink">{node.content?.map((child, index) => <Inline key={index} node={child} />)}</h3>
      );
    case "bulletList":
      return <ul className="list-disc space-y-2 pr-6 text-[15px] leading-8 text-charcoal marker:text-flame-700">{node.content?.map((item, index) => <li key={index}>{item.content?.map((child, childIndex) => <Inline key={childIndex} node={child} />)}</li>)}</ul>;
    case "orderedList":
      return <ol className="list-decimal space-y-2 pr-6 text-[15px] leading-8 text-charcoal marker:font-bold marker:text-flame-700">{node.content?.map((item, index) => <li key={index}>{item.content?.map((child, childIndex) => <Inline key={childIndex} node={child} />)}</li>)}</ol>;
    case "quote":
      return <blockquote className="border-r-2 border-flame-700 bg-plaster/60 px-5 py-4 text-[15px] leading-8 text-ash">{node.content?.map((child, index) => <Inline key={index} node={child} />)}</blockquote>;
    case "codeBlock":
      return <pre className="overflow-x-auto rounded-card bg-ink p-5 text-left text-sm leading-7 text-white/80" dir="ltr"><code>{node.content?.map((child) => child.text ?? "").join("")}</code></pre>;
    case "image":
      return <Image src={node.attrs?.src as string} alt={(node.attrs?.alt as string) ?? ""} width={800} height={500} className="my-8 h-auto w-full rounded-card object-cover" />;
    case "horizontalRule":
      return <hr className="my-8 border-plaster" />;
    case "productCard": {
      const productId = node.attrs?.productId as string;
      const product = productId ? await db().product.findUnique({ where: { id: productId }, include: { variants: { orderBy: { price: "asc" } } } }) : null;
      if (!product) return null;
      return (
        <Link href={`/product/${product.slug}`} className="my-8 flex items-center gap-4 rounded-card bg-plaster/70 p-4 transition-colors hover:bg-plaster">
          {product.variants[0]?.images?.[0] && <div className="relative size-16 shrink-0 overflow-hidden rounded-card bg-canvas"><Image src={product.variants[0].images[0]} alt={product.name} fill sizes="64px" className="object-contain p-1 mix-blend-multiply" /></div>}
          <div className="min-w-0"><div className="font-bold text-ink">{product.name}</div><div className="mt-1 text-sm text-flame-800">مشاهده محصول</div></div>
        </Link>
      );
    }
    case "imageGallery": {
      const images = (node.attrs?.images as Array<{ src: string; alt?: string }>) ?? [];
      return <div className="my-8 grid grid-cols-2 gap-3 md:grid-cols-3">{images.map((image, index) => <Image key={`${image.src}-${index}`} src={image.src} alt={image.alt ?? ""} width={400} height={300} className="h-full w-full rounded-card object-cover" />)}</div>;
    }
    case "video":
      return <div className="my-8 aspect-video overflow-hidden rounded-card bg-ink"><video controls className="h-full w-full" src={node.attrs?.url as string} /></div>;
    case "callout": {
      const kind = node.attrs?.kind as string;
      const cls = kind === "warning" ? "border-amber-200 bg-amber-50 text-amber-950" : kind === "tip" ? "border-flame-200 bg-flame-50 text-flame-900" : "border-plaster bg-plaster text-ink";
      return <div className={`my-6 rounded-card border px-4 py-3.5 text-sm leading-7 ${cls}`}>{node.attrs?.text as string}</div>;
    }
    default:
      return null;
  }
}

function Inline({ node }: { node: Node }) {
  const text = node.text ?? "";
  if (node.type === "text") {
    let element: React.ReactNode = text;
    if (node.marks?.some((mark) => mark.type === "bold")) element = <strong className="font-bold text-ink">{element}</strong>;
    if (node.marks?.some((mark) => mark.type === "italic")) element = <em>{element}</em>;
    if (node.marks?.some((mark) => mark.type === "code")) element = <code className="rounded bg-plaster px-1 text-sm text-ink" dir="ltr">{element}</code>;
    const link = node.marks?.find((mark) => mark.type === "link");
    if (link?.attrs?.href) {
      const href = link.attrs.href as string;
      element = href.startsWith("/") ? <Link href={href} className="text-flame-800 underline underline-offset-4">{element}</Link> : <a href={href} className="text-flame-800 underline underline-offset-4">{element}</a>;
    }
    return <>{element}</>;
  }
  return null;
}

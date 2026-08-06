import Link from "next/link";
import Image from "next/image";
import { db } from "@kmodern/db";
import type { Block, ComponentProps } from "@kmodern/schema";
import { hrefFor } from "@/lib/nav";
import { getPublishedPosts, getPublishedProducts, getCollections } from "@/lib/queries";
import { formatToman } from "@kmodern/schema";

// 005 page-builder renderer. Block list from DB Page.publishedBlocks; each
// type renders server-side. visibility/mobileVisible honored when set.

export default async function BlockRenderer({ blocks }: { blocks: Block[] }) {
  const visible = blocks.filter((b) => b.props.visible !== false);
  return (
    <>
      {visible.map((b) => (
        <BlockNode key={b.id} block={b} />
      ))}
    </>
  );
}

async function Section({ children, padding, background, mobileVisible, anchorId }: {
  children: React.ReactNode;
  padding?: string;
  background?: string;
  mobileVisible?: boolean;
  anchorId?: string;
}) {
  if (mobileVisible === false) return null;
  const pad = padding === "none" ? "py-0" : padding === "sm" ? "py-6" : padding === "lg" ? "py-20" : "py-12";
  const bg = background && background.startsWith("bg-") ? background : background ? `bg-[${background}]` : "bg-white";
  return (
    <section id={anchorId} className={`${pad} ${bg} w-full`}>
      <div className="mx-auto max-w-7xl px-4">{children}</div>
    </section>
  );
}

async function BlockNode({ block }: { block: Block }) {
  const { type, props } = block;
  const anyProps = props as Record<string, never>;

  switch (type) {
    case "hero": {
      const p = props as ComponentProps["hero"];
      const cta = p.cta ? await hrefFor(p.cta.link) : null;
      return (
        <section className="relative w-full overflow-hidden bg-slate-900 py-24 text-white">
          {p.image?.src && (
            <div className="absolute inset-0">
              <Image src={p.image.src} alt={p.image.alt ?? ""} fill className="object-cover opacity-40" />
            </div>
          )}
          <div className="relative mx-auto max-w-7xl px-4 text-center">
            <h1 className="text-4xl font-bold md:text-5xl">{p.title}</h1>
            {p.subtitle && <p className="mt-4 text-lg text-slate-200">{p.subtitle}</p>}
            {cta && (
              <Link
                href={cta.href}
                target={cta.newTab ? "_blank" : undefined}
                className="mt-8 inline-block rounded-full bg-amber-500 px-8 py-3 font-semibold text-slate-900 hover:bg-amber-400"
              >
                {p.cta!.label}
              </Link>
            )}
          </div>
        </section>
      );
    }

    case "productGrid": {
      const p = props as ComponentProps["productGrid"];
      let products = await getPublishedProducts({ limit: 8 });
      if (p.source.kind === "COLLECTION") products = await getPublishedProducts({ collectionId: p.source.collectionId, limit: 8 });
      if (p.source.kind === "CATEGORY") products = await getPublishedProducts({ categoryId: p.source.categoryId, limit: 8 });
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          {p.title && <h2 className="mb-6 text-2xl font-bold">{p.title}</h2>}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {products.map((pr) => <ProductCard key={pr.id} product={pr} />)}
          </div>
        </Section>
      );
    }

    case "productSlider": {
      const p = props as ComponentProps["productSlider"];
      const products = await getPublishedProducts({ limit: p.source.kind === "COLLECTION" ? undefined : 10 });
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          {p.title && <h2 className="mb-6 text-2xl font-bold">{p.title}</h2>}
          <div className="grid grid-cols-2 gap-4 overflow-x-auto md:grid-cols-5">
            {products.slice(0, 10).map((pr) => <ProductCard key={pr.id} product={pr} />)}
          </div>
        </Section>
      );
    }

    case "richText": {
      const p = props as ComponentProps["richText"];
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          <div className="prose prose-lg max-w-none" dangerouslySetInnerHTML={{ __html: p.html }} />
        </Section>
      );
    }

    case "banner":
    case "bannerPair":
    case "bannerTrio": {
      const p = props as ComponentProps["banner"] & { banners?: ComponentProps["banner"][] };
      const items = p.banners ?? [p];
      const cols = type === "banner" ? 1 : type === "bannerPair" ? 2 : 3;
      const links = await Promise.all(items.map(async (b) => (b.image?.link ? hrefFor(b.image.link) : null)));
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          <div className={`grid gap-4 ${cols === 1 ? "" : cols === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
            {items.map((b, i) => {
              const link = links[i];
              const inner = (
                <div key={i} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-gray-100">
                  {b.image?.src && <Image src={b.image.src} alt={b.image.alt ?? b.title ?? ""} fill className="object-cover" />}
                  {b.title && <div className="absolute inset-0 flex items-center justify-center bg-black/20 p-4 text-center text-white"><span className="font-bold">{b.title}</span></div>}
                </div>
              );
              return link ? (
                <Link key={i} href={link.href} target={link.newTab ? "_blank" : undefined} className="block">{inner}</Link>
              ) : (
                inner
              );
            })}
          </div>
        </Section>
      );
    }

    case "uspRow": {
      const p = props as ComponentProps["uspRow"];
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {p.items.map((it, i) => (
              <div key={i} className="text-center">
                {it.icon && <div className="mx-auto mb-2 text-3xl">{it.icon}</div>}
                <div className="font-semibold">{it.title}</div>
                {it.text && <div className="mt-1 text-sm text-gray-500">{it.text}</div>}
              </div>
            ))}
          </div>
        </Section>
      );
    }

    case "categoryTiles": {
      const p = props as ComponentProps["categoryTiles"];
      const tiles = await Promise.all(
        p.categories.map(async (c, idx) => {
          const cat = await db().category.findUnique({ where: { id: c.categoryId }, select: { slug: true, name: true } });
          return { idx, c, href: cat ? `/category/${cat.slug}` : "/", name: cat?.name ?? "دسته", image: c.image };
        }),
      );
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          {p.title && <h2 className="mb-6 text-2xl font-bold">{p.title}</h2>}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {tiles.map((t) => (
              <Link key={t.idx} href={t.href} className="overflow-hidden rounded-xl bg-gray-100 p-6 text-center hover:bg-gray-200">
                {t.image && <Image src={t.image} alt="" width={200} height={200} className="mx-auto mb-3 rounded-lg object-cover" />}
                <span className="font-semibold">{t.name}</span>
              </Link>
            ))}
          </div>
        </Section>
      );
    }

    case "spacer": {
      const p = props as ComponentProps["spacer"];
      return <div style={{ height: p.height }} aria-hidden />;
    }

    case "imageTextSplit": {
      const p = props as ComponentProps["imageTextSplit"];
      const img = p.image;
      const flip = p.imageSide === "RIGHT";
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          <div className={`grid items-center gap-8 md:grid-cols-2 ${flip ? "md:[direction:ltr]" : ""}`}>
            <div><Image src={img.src} alt={img.alt ?? ""} width={600} height={450} className="w-full rounded-xl object-cover" /></div>
            <div>
              <h3 className="text-2xl font-bold">{p.title}</h3>
              {p.text && <p className="mt-3 text-gray-600">{p.text}</p>}
            </div>
          </div>
        </Section>
      );
    }

    case "slidingStrip": {
      const p = props as ComponentProps["slidingStrip"];
      return (
        <div className="overflow-hidden bg-slate-900 py-3 text-center text-white">
          <div className="flex gap-8 whitespace-nowrap text-sm">
            {[...p.items, ...p.items].map((s, i) => <span key={i}>{s}</span>)}
          </div>
        </div>
      );
    }

    case "testimonials": {
      const p = props as ComponentProps["testimonials"];
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          {p.title && <h2 className="mb-6 text-2xl font-bold">{p.title}</h2>}
          <div className="grid gap-4 md:grid-cols-3">
            {p.items.map((t, i) => (
              <div key={i} className="rounded-xl bg-gray-50 p-6">
                <p className="text-gray-700">«{t.quote}»</p>
                <div className="mt-4 font-semibold">{t.author}</div>
                {t.role && <div className="text-sm text-gray-500">{t.role}</div>}
              </div>
            ))}
          </div>
        </Section>
      );
    }

    case "faqAccordion": {
      const p = props as ComponentProps["faqAccordion"];
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          {p.title && <h2 className="mb-6 text-2xl font-bold">{p.title}</h2>}
          <div className="space-y-3">
            {p.items.map((it, i) => (
              <details key={i} className="rounded-lg border p-4">
                <summary className="cursor-pointer font-semibold">{it.question}</summary>
                <p className="mt-2 text-gray-600">{it.answer}</p>
              </details>
            ))}
          </div>
        </Section>
      );
    }

    case "video": {
      const p = props as ComponentProps["video"];
      const embed =
        p.provider === "APARAT"
          ? p.url
          : p.url.includes("youtube.com") || p.url.includes("youtu.be")
            ? null
            : p.url;
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          <div className="aspect-video overflow-hidden rounded-xl bg-black">
            <video controls poster={p.thumbnail} className="h-full w-full">
              <source src={embed ?? undefined} />
            </video>
          </div>
        </Section>
      );
    }

    case "countdown":
    case "blogTeaser": {
      const p = props as ComponentProps["blogTeaser"];
      const posts = await getPublishedPosts(p.limit ?? 3);
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          {p.title && <h2 className="mb-6 text-2xl font-bold">{p.title}</h2>}
          <div className="grid gap-4 md:grid-cols-3">
            {posts.map((post) => (
              <Link key={post.id} href={`/blog/${post.slug}`} className="rounded-xl border p-4 hover:shadow">
                <div className="font-semibold">{post.title}</div>
                {post.excerpt && <p className="mt-2 text-sm text-gray-500">{post.excerpt}</p>}
              </Link>
            ))}
          </div>
        </Section>
      );
    }

    case "trustBadges": {
      const p = props as ComponentProps["trustBadges"];
      return (
        <div className="border-y bg-gray-50">
          <div className="mx-auto flex max-w-7xl flex-wrap justify-center gap-8 py-6">
            {p.items.map((it, i) => (
              <div key={i} className="flex items-center gap-2 text-sm font-semibold">
                {it.icon && <span>{it.icon}</span>}
                {it.label}
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "newsletter":
      return <div />;
    case "statsRow": {
      const p = props as ComponentProps["statsRow"];
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {p.items.map((it, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl font-bold">{it.value}</div>
                <div className="mt-1 text-gray-500">{it.label}</div>
              </div>
            ))}
          </div>
        </Section>
      );
    }
    case "comparisonTable":
      return null; // admin-created; storefront renders latest
    case "beforeAfter": {
      const p = props as ComponentProps["beforeAfter"];
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="relative aspect-video"><Image src={p.before.src} alt="قبل" fill className="object-cover" /></div>
          <div className="relative aspect-video"><Image src={p.after.src} alt="بعد" fill className="object-cover" /></div>
        </div>
      );
    }
    case "map": {
      const p = props as ComponentProps["map"];
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          {p.title && <h2 className="mb-4 text-2xl font-bold">{p.title}</h2>}
          <div className="aspect-video overflow-hidden rounded-xl bg-gray-100">
            <iframe src={p.embedUrl} className="h-full w-full" />
          </div>
        </Section>
      );
    }
    case "customHtml":
      return <div dangerouslySetInnerHTML={{ __html: (props as ComponentProps["customHtml"]).html }} />;
    default:
      return null;
  }
}

async function ProductCard({ product }: { product: { slug: string; name: string; price: number; maxPrice: number; image: string | null } }) {
  return (
    <Link href={`/product/${product.slug}`} className="group rounded-xl border p-4 transition hover:shadow-lg">
      <div className="relative mb-3 aspect-square overflow-hidden rounded-lg bg-gray-100">
        {product.image ? <Image src={product.image} alt={product.name} fill className="object-cover" /> : <div className="flex h-full items-center justify-center text-gray-400">بدون تصویر</div>}
      </div>
      <div className="text-sm font-semibold leading-snug">{product.name}</div>
      <div className="mt-2 text-sm text-gray-500">
        {product.price === product.maxPrice ? formatToman(product.price) : `${formatToman(product.price)} – ${formatToman(product.maxPrice)}`}
      </div>
    </Link>
  );
}
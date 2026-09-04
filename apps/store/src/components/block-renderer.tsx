import Link from "next/link";
import Image from "next/image";
import { db } from "@kmodern/db";
import type { Block, ComponentProps } from "@kmodern/schema";
import { hrefFor } from "@/lib/nav";
import { getPublishedPosts, getPublishedProducts, getCollections } from "@/lib/queries";
import { formatToman } from "@kmodern/schema";
import { FadeWords } from "@kmodern/ui";
import { CountdownTimer } from "./countdown-timer";
import { NewsletterForm } from "./newsletter-form";
import { ProductCard } from "./product-grid";

// 005 page-builder renderer. Block list from DB Page.publishedBlocks; each
// type renders server-side. visibility/mobileVisible honored when set.

// Aparat: https://www.aparat.com/v/{hash} -> iframe embed
function aparatEmbed(url: string): string | null {
  const hash = url.match(/aparat\.com\/v\/([A-Za-z0-9-]+)/)?.[1];
  return hash ? `https://www.aparat.com/video/video/embed/videohash/${hash}/vt/frame` : null;
}

function youtubeEmbed(url: string): string | null {
  const id = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/)?.[1];
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

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
        <section className="relative min-h-[80vh] w-full overflow-hidden bg-ink">
          {p.image?.src && (
            <div className="absolute inset-0">
              {/* hero is the LCP element on / — load eagerly */}
              <Image src={p.image.src} alt={p.image.alt ?? ""} fill priority className="object-cover opacity-60" />
            </div>
          )}
          <div className="relative mx-auto flex min-h-[80vh] max-w-7xl flex-col justify-end px-4 pb-16">
            {cta && (
              <Link
                href={cta.href}
                target={cta.newTab ? "_blank" : undefined}
                className="mb-6 inline-flex w-fit items-center rounded-card bg-flame-700 px-3 py-1 text-xs font-semibold text-white"
              >
                {p.cta!.label}
              </Link>
            )}
            <FadeWords
              text={p.title}
              className="text-ink drop-shadow-[0_2px_12px_rgba(255,255,255,0.4)] [font-size:clamp(44px,7vw,96px)] font-black leading-none"
            />
            {p.subtitle && (
              <p className="mt-4 max-w-xl text-base text-white/80">{p.subtitle}</p>
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
          {p.title && <h2 className="mb-8 text-2xl font-black text-ink">{p.title}</h2>}
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
          {p.title && <h2 className="mb-8 text-2xl font-black text-ink">{p.title}</h2>}
          <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2">
            {products.slice(0, 10).map((pr) => (
              <div key={pr.id} className="w-52 shrink-0 snap-start sm:w-60">
                <ProductCard product={pr} />
              </div>
            ))}
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
                <div key={i} className="relative aspect-[4/3] overflow-hidden rounded-card bg-plaster">
                  {b.image?.src && <Image src={b.image.src} alt={b.image.alt ?? b.title ?? ""} fill className="object-cover" />}
                  {b.title && <div className="absolute inset-0 flex items-center justify-center bg-black/20 p-4 text-center text-white"><span className="font-semibold">{b.title}</span></div>}
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
                {it.text && <div className="mt-1 text-sm text-ash">{it.text}</div>}
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
          {p.title && <h2 className="mb-8 text-2xl font-black text-ink">{p.title}</h2>}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {tiles.map((t) => (
              <Link key={t.idx} href={t.href} className="overflow-hidden rounded-card bg-plaster p-6 text-center hover:bg-fog/60">
                {t.image && <Image src={t.image} alt="" width={200} height={200} className="mx-auto mb-3 rounded-card object-cover" />}
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
            <div><Image src={img.src} alt={img.alt ?? ""} width={600} height={450} className="w-full rounded-card object-cover" /></div>
            <div>
              <h3 className="text-2xl font-semibold">{p.title}</h3>
              {p.text && <p className="mt-3 text-ash">{p.text}</p>}
            </div>
          </div>
        </Section>
      );
    }

    case "slidingStrip": {
      const p = props as ComponentProps["slidingStrip"];
      return (
        <div className="overflow-hidden bg-ink py-3 text-center text-white">
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
          {p.title && <h2 className="mb-8 text-2xl font-black text-ink">{p.title}</h2>}
          <div className="grid gap-4 md:grid-cols-3">
            {p.items.map((t, i) => (
              <div key={i} className="rounded-card bg-plaster p-6">
                <p className="text-ink">«{t.quote}»</p>
                <div className="mt-4 font-semibold">{t.author}</div>
                {t.role && <div className="text-sm text-ash">{t.role}</div>}
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
          {p.title && <h2 className="mb-8 text-2xl font-black text-ink">{p.title}</h2>}
          <div className="space-y-3">
            {p.items.map((it, i) => (
              <details key={i} className="rounded-card border p-4">
                <summary className="cursor-pointer font-semibold">{it.question}</summary>
                <p className="mt-2 text-ash">{it.answer}</p>
              </details>
            ))}
          </div>
        </Section>
      );
    }

    case "video": {
      const p = props as ComponentProps["video"];
      const embed = p.provider === "APARAT" ? aparatEmbed(p.url) : youtubeEmbed(p.url);
      if (!embed) return null;
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          {p.title && <h2 className="mb-4 text-2xl font-semibold">{p.title}</h2>}
          <div className="aspect-video overflow-hidden rounded-card bg-black">
            <iframe src={embed} title={p.title ?? "ویدیو"} allowFullScreen className="h-full w-full" />
          </div>
        </Section>
      );
    }

    case "countdown": {
      const p = props as ComponentProps["countdown"];
      const link = p.link ? await hrefFor(p.link) : null;
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          {p.title && <h2 className="mb-6 text-center text-2xl font-extrabold text-ink">{p.title}</h2>}
          <CountdownTimer endsAt={p.endsAt} linkHref={link?.href} />
        </Section>
      );
    }

    case "blogTeaser": {
      const p = props as ComponentProps["blogTeaser"];
      const posts = await getPublishedPosts(p.limit ?? 3);
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          {p.title && <h2 className="mb-8 text-2xl font-black text-ink">{p.title}</h2>}
          <div className="grid gap-4 md:grid-cols-3">
            {posts.map((post) => (
              <Link key={post.id} href={`/blog/${post.slug}`} className="rounded-card border p-4 hover:shadow">
                <div className="font-semibold">{post.title}</div>
                {post.excerpt && <p className="mt-2 text-sm text-ash">{post.excerpt}</p>}
              </Link>
            ))}
          </div>
        </Section>
      );
    }

    case "trustBadges": {
      const p = props as ComponentProps["trustBadges"];
      return (
        <div className="border-y bg-plaster">
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

    case "newsletter": {
      const p = props as ComponentProps["newsletter"];
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          {p.title && <h2 className="mb-2 text-center text-2xl font-extrabold text-ink">{p.title}</h2>}
          {p.subtitle && <p className="mb-6 text-center text-ash">{p.subtitle}</p>}
          <NewsletterForm title={p.title} />
        </Section>
      );
    }
    case "statsRow": {
      const p = props as ComponentProps["statsRow"];
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {p.items.map((it, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl font-semibold">{it.value}</div>
                <div className="mt-1 text-ash">{it.label}</div>
              </div>
            ))}
          </div>
        </Section>
      );
    }
    case "comparisonTable": {
      const p = props as ComponentProps["comparisonTable"];
      const products = await db().product.findMany({
        where: { id: { in: p.productIds }, status: "PUBLISHED" },
        include: { variants: { orderBy: { price: "asc" }, take: 1 } },
      });
      if (products.length < 2) return null;
      const specValues = await db().productSpecValue.findMany({
        where: { productId: { in: products.map((pr) => pr.id) } },
        select: { productId: true, value: true, specFieldId: true, specField: { select: { name: true } } },
      });
      const fieldNames = [...new Set(specValues.map((sv) => sv.specField.name))];
      const valueOf = (productId: string, fieldName: string) =>
        specValues.find((sv) => sv.productId === productId && sv.specField.name === fieldName)?.value ?? "—";
      return (
        <Section padding={p.padding} background={p.background} mobileVisible={p.mobileVisible} anchorId={p.anchorId}>
          {p.title && <h2 className="mb-8 text-2xl font-black text-ink">{p.title}</h2>}
          <div className="overflow-x-auto rounded-2xl border border-plaster">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-plaster text-right">
                  <th className="px-4 py-3 font-semibold">ویژگی</th>
                  {products.map((pr) => (
                    <th key={pr.id} className="px-4 py-3 font-semibold">{pr.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-plaster">
                <tr>
                  <td className="px-4 py-2.5 text-ash">قیمت</td>
                  {products.map((pr) => (
                    <td key={pr.id} className="whitespace-nowrap px-4 py-2.5 font-bold text-flame-800">
                      {pr.variants[0] ? formatToman(pr.variants[0].price) : "—"}
                    </td>
                  ))}
                </tr>
                {fieldNames.map((name) => (
                  <tr key={name}>
                    <td className="px-4 py-2.5 text-ash">{name}</td>
                    {products.map((pr) => (
                      <td key={pr.id} className="px-4 py-2.5">{valueOf(pr.id, name)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      );
    }
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
          {p.title && <h2 className="mb-4 text-2xl font-semibold">{p.title}</h2>}
          <div className="aspect-video overflow-hidden rounded-card bg-plaster">
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

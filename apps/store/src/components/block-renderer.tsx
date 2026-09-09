import Link from "next/link";
import Image from "next/image";
import { db } from "@kmodern/db";
import type { Block, ComponentProps } from "@kmodern/schema";
import { hrefFor } from "@/lib/nav";
import { getPublishedPosts, getPublishedProducts } from "@/lib/queries";
import { FadeWords, RankNumeral, SectionHeader } from "@kmodern/ui";
import { ShowcaseCard } from "./showcase-card";
import { FloatingProductCard } from "./floating-product-card";
import { NewsletterForm } from "./newsletter-form";
import { CountdownTimer } from "./countdown-timer";

// Page-builder renderer. Block list from DB Page.publishedBlocks; each type
// renders server-side. Sections follow the reference anatomy exactly.

function Section({
  children,
  padding = "md",
  className,
  id,
}: {
  children: React.ReactNode;
  padding?: "sm" | "md" | "lg" | string;
  className?: string;
  id?: string;
}) {
  const pad = padding === "sm" ? "py-10" : padding === "lg" ? "py-24" : "py-16";
  return (
    <section id={id} className={cnSection(pad, className)}>
      {children}
    </section>
  );
}

function cnSection(pad: string, className?: string) {
  return `mx-auto max-w-[1440px] px-4 ${pad} ${className ?? ""}`;
}

async function ProductCards({ products }: { products: Awaited<ReturnType<typeof getPublishedProducts>> }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {products.map((pr) => (
        <ShowcaseCard
          key={pr.id}
          href={`/product/${pr.slug}`}
          name={pr.name}
          model={pr.model}
          price={pr.price}
          maxPrice={pr.maxPrice}
          available={pr.available}
          variants={pr.dots}
        />
      ))}
    </div>
  );
}

/* ---------- Video embeds: schema carries the full watch/page URL; the
   renderer derives the iframe src. APARAT accepts /v/<hash> page URLs or
   its own /video/video/embed/videohash/<hash>/vt/frame embeds. ---------- */
function aparatEmbed(url: string): string | null {
  const hash = url.match(/videohash\/([\w-]+)/)?.[1] ?? url.match(/aparat\.com\/v\/([\w-]+)/)?.[1];
  return hash ? `https://www.aparat.com/video/video/embed/videohash/${hash}/vt/frame` : null;
}

function youtubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    const id = u.pathname.match(/\/(?:embed|shorts|v)\/([\w-]+)/)?.[1] ?? u.searchParams.get("v");
    return id ? `https://www.youtube.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

async function BlockNode({ block }: { block: Block }) {
  const { type, props } = block;

  switch (type) {
    /* ---------- Hero: full-viewport photographic, overlay bottom-RIGHT
       (RTL mirror of Zellerfeld's bottom-left), floating buy-card on the
       opposite side. New-in badge → display headline → subhead. ---------- */
    case "hero": {
      const p = props as ComponentProps["hero"];
      const cta = p.cta ? await hrefFor(p.cta.link) : null;
      const products = await getPublishedProducts({ limit: 1 });
      const hero = products[0];
      return (
        <section className="relative min-h-[88vh] w-full overflow-hidden bg-ink">
          {p.image?.src && (
            <div className="absolute inset-0">
              <Image src={p.image.src} alt={p.image.alt ?? ""} fill priority className="object-cover" />
            </div>
          )}
          {/* legibility wash over the bottom third only */}
          <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/55 to-transparent" />

          <div className="relative mx-auto flex min-h-[88vh] max-w-[1440px] flex-col justify-end gap-6 px-4 pb-14 md:flex-row md:items-end md:justify-between">
            {/* overlay stack — bottom-right in RTL */}
            <div className="max-w-2xl">
            {cta && (
              <Link
                href={cta.href}
                target={cta.newTab ? "_blank" : undefined}
                className="mb-5 inline-flex items-center rounded-[30px] bg-flame-700 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-flame-600"
              >
                {p.cta!.label}
              </Link>
            )}
              <FadeWords
                text={p.title}
                className="block font-display text-white [font-size:clamp(48px,8vw,112px)] font-black leading-[1.02]"
              />
              {p.subtitle && <p className="mt-4 max-w-md text-[15px] leading-7 text-white/80">{p.subtitle}</p>}
            </div>

            {/* floating buy-card — opposite side */}
            {hero && (
              <div className="w-full max-w-[280px] shrink-0 md:mb-2">
                <FloatingProductCard
                  href={`/product/${hero.slug}`}
                  name={hero.name}
                  image={hero.image}
                  price={hero.price}
                  maxPrice={hero.maxPrice}
                />
              </div>
            )}
          </div>
        </section>
      );
    }

    /* ---------- Ranked editorial row: giant translucent Persian numeral
       watermark top-right of each plaster card, product centered. ---------- */
    case "productGrid": {
      const p = props as ComponentProps["productGrid"];
      let products = await getPublishedProducts({ limit: 4 });
      if (p.source.kind === "COLLECTION") products = await getPublishedProducts({ collectionId: p.source.collectionId, limit: 4 });
      if (p.source.kind === "CATEGORY") products = await getPublishedProducts({ categoryId: p.source.categoryId, limit: 4 });
      return (
        <Section>
          {p.title && <SectionHeader title={p.title} seeAllHref="/products" />}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((pr, i) => (
              <div key={pr.id} className="relative">
                <RankNumeral rank={i + 1} />
                <ShowcaseCard
                  href={`/product/${pr.slug}`}
                  name={pr.name}
                  model={pr.model}
                  price={pr.price}
                  maxPrice={pr.maxPrice}
                  available={pr.available}
                  variants={pr.dots}
                />
              </div>
            ))}
          </div>
        </Section>
      );
    }

    case "productSlider": {
      const p = props as ComponentProps["productSlider"];
      const products = await getPublishedProducts({ limit: 8 });
      return (
        <Section>
          {p.title && <SectionHeader title={p.title} seeAllHref="/products" />}
          <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2">
            {products.slice(0, 8).map((pr) => (
              <div key={pr.id} className="w-64 shrink-0 snap-start sm:w-72">
                <ShowcaseCard
                  href={`/product/${pr.slug}`}
                  name={pr.name}
                  model={pr.model}
                  price={pr.price}
                  maxPrice={pr.maxPrice}
                  available={pr.available}
                  variants={pr.dots}
                />
              </div>
            ))}
          </div>
        </Section>
      );
    }

    case "categoryTiles": {
      const p = props as ComponentProps["categoryTiles"];
      const tiles = await Promise.all(
        p.categories.map(async (c) => {
          const cat = await db().category.findUnique({ where: { id: c.categoryId }, select: { slug: true, name: true } });
          return { href: cat ? `/category/${cat.slug}` : "/", name: cat?.name ?? "دسته", image: c.image };
        }),
      );
      return (
        <Section>
          {p.title && <SectionHeader title={p.title} />}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {tiles.map((t) => (
              <Link key={t.href} href={t.href} className="group overflow-hidden rounded-card bg-plaster">
                <div className="relative aspect-[4/3]">
                  {t.image && <Image src={t.image} alt={t.name} fill sizes="(max-width:768px) 50vw, 20vw" className="object-contain p-4 mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.04]" />}
                </div>
                <div className="border-t border-white/60 px-3 py-3 text-center font-display text-sm font-bold text-ink">
                  {t.name}
                </div>
              </Link>
            ))}
          </div>
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
        <Section>
          <div className={`grid gap-4 ${cols === 1 ? "mx-auto max-w-[1100px]" : cols === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
            {items.map((b, i) => {
              const link = links[i];
              const inner = (
                <div key={i} className="relative aspect-[16/9] max-h-[520px] w-full overflow-hidden rounded-card bg-plaster">
                  {b.image?.src && <Image src={b.image.src} alt={b.image.alt ?? b.title ?? ""} fill sizes="(max-width:768px) 100vw, 50vw" className="object-cover" />}
                  {b.title && (
                    <div className="absolute bottom-5 right-6 max-w-[70%]">
                      <span className="font-display text-2xl font-extrabold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]">{b.title}</span>
                    </div>
                  )}
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

    /* ---------- Featured-in press bar: ink full-bleed, 100px ---------- */
    case "uspRow": {
      const p = props as ComponentProps["uspRow"];
      return (
        <div className="w-full bg-ink">
          <div className="mx-auto flex h-[88px] max-w-[1440px] flex-wrap items-center justify-evenly gap-4 px-4">
            {p.items.map((it, i) => (
              <span key={i} className="text-sm font-bold text-white/60">{it.title}</span>
            ))}
          </div>
        </div>
      );
    }

    case "testimonials": {
      const p = props as ComponentProps["testimonials"];
      return (
        <Section>
          {p.title && <SectionHeader title={p.title} />}
          <div className="grid gap-4 md:grid-cols-3">
            {p.items.map((t, i) => (
              <div key={i} className="rounded-card bg-plaster p-6">
                <p className="text-sm leading-7 text-ink">«{t.quote}»</p>
                <div className="mt-4 text-code text-xs text-ash">{t.author}{t.role ? ` · ${t.role}` : ""}</div>
              </div>
            ))}
          </div>
        </Section>
      );
    }

    case "imageTextSplit": {
      const p = props as ComponentProps["imageTextSplit"];
      const img = p.image;
      return (
        <Section>
          <div className="grid items-center gap-8 md:grid-cols-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-plaster">
              <Image src={img.src} alt={img.alt ?? ""} fill sizes="(max-width:768px) 100vw, 50vw" className="object-cover" />
            </div>
            <div>
              <h3 className="font-display text-3xl font-extrabold text-ink">{p.title}</h3>
              {p.text && <p className="mt-4 max-w-md leading-8 text-ash">{p.text}</p>}
            </div>
          </div>
        </Section>
      );
    }

    case "richText": {
      const p = props as ComponentProps["richText"];
      return (
        <Section>
          <div className="mx-auto max-w-3xl leading-9 text-ink [&_a]:text-flame-700 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-black [&_p]:mb-4" dangerouslySetInnerHTML={{ __html: p.html }} />
        </Section>
      );
    }

    case "newsletter": {
      const p = props as ComponentProps["newsletter"];
      return (
        <Section>
          {p.title && <h2 className="mb-2 text-center font-display text-2xl font-extrabold text-ink">{p.title}</h2>}
          {p.subtitle && <p className="mb-6 text-center text-sm text-ash">{p.subtitle}</p>}
          <NewsletterForm />
        </Section>
      );
    }

    case "countdown": {
      const p = props as ComponentProps["countdown"];
      const link = p.link ? await hrefFor(p.link) : null;
      return (
        <Section>
          {p.title && <h2 className="mb-6 text-center font-display text-2xl font-extrabold text-ink">{p.title}</h2>}
          <CountdownTimer endsAt={p.endsAt} linkHref={link?.href} />
        </Section>
      );
    }

    case "blogTeaser": {
      const p = props as ComponentProps["blogTeaser"];
      const posts = await getPublishedPosts(p.limit ?? 3);
      return (
        <Section>
          {p.title && <SectionHeader title={p.title} seeAllHref="/blog" />}
          <div className="grid gap-4 md:grid-cols-3">
            {posts.map((post) => (
              <Link key={post.id} href={`/blog/${post.slug}`} className="rounded-card bg-plaster p-6 transition-colors hover:bg-fog/60">
                <div className="font-display font-bold leading-7 text-ink">{post.title}</div>
                {post.excerpt && <p className="mt-2 text-sm leading-6 text-ash">{post.excerpt}</p>}
              </Link>
            ))}
          </div>
        </Section>
      );
    }

    case "faqAccordion": {
      const p = props as ComponentProps["faqAccordion"];
      return (
        <Section>
          {p.title && <SectionHeader title={p.title} />}
          <div className="mx-auto max-w-3xl divide-y divide-plaster border-y border-plaster">
            {p.items.map((it, i) => (
              <details key={i} className="group py-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-ink marker:hidden">{it.question}</summary>
                <p className="mt-2 text-sm leading-7 text-ash">{it.answer}</p>
              </details>
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
        <Section>
          {p.title && <SectionHeader title={p.title} />}
          <div className="overflow-x-auto rounded-card border border-plaster">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-plaster text-right">
                  <th className="px-4 py-3 font-semibold text-ash">ویژگی</th>
                  {products.map((pr) => (
                    <th key={pr.id} className="px-4 py-3 font-semibold text-ink">{pr.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-plaster">
                {fieldNames.map((name) => (
                  <tr key={name}>
                    <td className="px-4 py-2.5 text-ash">{name}</td>
                    {products.map((pr) => (
                      <td key={pr.id} className="px-4 py-2.5 text-ink">{valueOf(pr.id, name)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      );
    }

    case "spacer":
      return <div style={{ height: (props as ComponentProps["spacer"]).height }} aria-hidden />;

    case "video": {
      const p = props as ComponentProps["video"];
      const src = p.provider === "YOUTUBE" ? youtubeEmbed(p.url) : aparatEmbed(p.url);
      if (!src) return null;
      return (
        <Section>
          {p.title && <SectionHeader title={p.title} />}
          <div className="mx-auto aspect-video w-full max-w-[1100px] overflow-hidden rounded-card bg-ink">
            <iframe src={src} title={p.title ?? "ویدیو"} loading="lazy" allowFullScreen className="h-full w-full" />
          </div>
        </Section>
      );
    }

    default:
      return null;
  }
}

export default async function BlockRenderer({ blocks }: { blocks: Block[] }) {
  const visible = blocks.filter((b) => (b.props as { visible?: boolean })?.visible !== false);
  return (
    <main className="min-h-screen bg-canvas">
      {visible.map((b) => (
        <BlockNode key={b.id} block={b} />
      ))}
    </main>
  );
}

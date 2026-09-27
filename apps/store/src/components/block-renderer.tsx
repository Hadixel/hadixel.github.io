import Link from "next/link";
import Image from "next/image";
import type { ComponentProps } from "@kmodern/schema";
import { sanitizeAdminHtml } from "@kmodern/schema/sanitize";
import type { BlockData, ResolvedBlock } from "@/lib/gateway";
import { RankNumeral, SectionHeader } from "@kmodern/ui";
import { ShowcaseCard } from "./showcase-card";
import { HomeHero } from "./home-hero";
import { NewsletterForm } from "./newsletter-form";
import { CountdownTimer } from "./countdown-timer";
import { AnimatedContent, LogoLoop } from "./reactbits";

// Page-builder renderer. The gateway hands over each block with the data it
// needs already resolved, so this file only draws. Sections follow the
// reference anatomy exactly.

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
  const pad = padding === "none" ? "" : padding === "sm" ? "py-10" : padding === "lg" ? "py-24" : "py-16";
  return (
    <section id={id} className={cnSection(pad, className)}>
      {children}
    </section>
  );
}

function cnSection(pad: string, className?: string) {
  return `mx-auto max-w-[1440px] px-4 ${pad} ${className ?? ""}`;
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

/**
 * One block, drawn from what the gateway already resolved for it.
 *
 * Nothing in this file performs I/O, and that is the point rather than an accident. It used to:
 * six branches read the catalogue and four resolved a link's slug, so rendering a CMS page held a
 * database connection for as long as the render took. The gateway resolves all of it now, and the
 * absence of a data-tier import here is what makes the absence of a fallback possible.
 */
function BlockNode({ block }: { block: ResolvedBlock }) {
  const { type, props, data } = block;

  switch (type) {
    /* ---------- Hero: Burner Ignition. The catalog image is treated as a
       contained product stage, never as a destructive full-bleed crop. The
       existing storefront header remains outside this composition. ---------- */
    case "hero": {
      const p = props as ComponentProps["hero"];
      const cta = data.cta ?? null;
      const hero = data.product ?? null;
      return (
        <HomeHero
          title={p.title}
          subtitle={p.subtitle}
          cta={cta ? { href: cta.href, label: p.cta!.label, newTab: cta.newTab } : null}
          image={{
            src: p.image?.src ?? hero?.image ?? null,
            alt: p.image?.alt ?? hero?.name ?? p.title,
          }}
        />
      );
    }

    /* ---------- Ranked editorial row: giant translucent Persian numeral
       watermark top-right of each plaster card, product centered. ---------- */
    case "productGrid": {
      const p = props as ComponentProps["productGrid"];
      const products = data.products ?? [];
      return (
        <Section>
          {p.title && <SectionHeader title={p.title} seeAllHref="/products" />}
          <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((pr, i) => (
              <div key={pr.id} className="relative h-full">
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
      const products = data.products ?? [];
      return (
        <Section>
          {p.title && <SectionHeader title={p.title} seeAllHref="/products" />}
          <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2">
            {products.slice(0, p.limit ?? 8).map((pr) => (
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
      // One resolved tile per entry in props.categories, in the same order, so the image the admin
      // chose is zipped back on here instead of being looked up.
      const tiles = (data.tiles ?? []).map((tile, index) => ({
        ...tile,
        image: p.categories[index]?.image,
      }));
      return (
        <Section>
          {p.title && <SectionHeader title={p.title} />}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {tiles.map((t, i) => (
              <AnimatedContent key={t.href} delay={i * 70} distance={24}>
                <Link href={t.href} className="group block h-full overflow-hidden rounded-card bg-plaster transition-colors hover:bg-fog/60">
                  <div className="relative aspect-[4/3]">
                    {t.image && <Image src={t.image} alt={t.name} fill sizes="(max-width:768px) 50vw, 20vw" className="object-contain p-4 mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transform-none" />}
                  </div>
                  <div className="border-t border-white/60 px-3 py-3 text-center text-sm font-bold text-ink">
                    {t.name}
                  </div>
                </Link>
              </AnimatedContent>
            ))}
          </div>
        </Section>
      );
    }

    case "banner":
    case "bannerPair":
    case "bannerTrio": {
      const p = props as ComponentProps["banner"] & { banners?: ComponentProps["banner"][] };
      // Mirrors the gateway's `bannersOf`: a `banner` block is one banner, full stop, and only the
      // pair and trio forms carry an array. Deriving it the other way round — `p.banners ?? [p]` for
      // every type — agrees with the gateway on well-formed props and disagrees on a `banner` row
      // that also happens to carry a `banners` key, and the two are zipped by index, so the links
      // would bind to the wrong banners. Props arrive as stored rather than re-validated, so this
      // has to hold for what the row actually contains.
      const items = type === "banner" ? [p] : p.banners ?? [p];
      const cols = type === "banner" ? 1 : type === "bannerPair" ? 2 : 3;
      const links = data.links ?? [];
      return (
        <Section id={p.anchorId}>
          <div className={`grid gap-4 ${cols === 1 ? "mx-auto max-w-[1100px]" : cols === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
            {items.map((banner, index) => {
              const link = links[index];
              const inner = (
                <div className="group grid h-full overflow-hidden rounded-card bg-plaster transition-transform duration-300 motion-reduce:transform-none md:grid-cols-2">
                  <div className="relative min-h-64 overflow-hidden bg-canvas md:min-h-80">
                    {banner.image?.src && (
                      <Image
                        src={banner.image.src}
                        alt={banner.image.alt ?? banner.title ?? ""}
                        fill
                        sizes="(max-width:768px) 100vw, 50vw"
                        className="object-contain p-5 mix-blend-multiply transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transform-none"
                      />
                    )}
                  </div>
                  <div className="flex flex-col justify-center p-6 sm:p-8">
                    {banner.title && <div className="font-display text-2xl font-black leading-tight text-ink">{banner.title}</div>}
                    {banner.subtitle && <p className="mt-3 text-sm leading-7 text-ash">{banner.subtitle}</p>}
                    {link && (
                      <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-ink">
                        مشاهده
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      </span>
                    )}
                  </div>
                </div>
              );
              return link ? (
                <Link key={`${banner.image?.src ?? "banner"}-${index}`} href={link.href} target={link.newTab ? "_blank" : undefined} rel={link.newTab ? "noopener noreferrer" : undefined} className="block rounded-card focus-visible:outline-offset-4">
                  {inner}
                </Link>
              ) : (
                <div key={`${banner.image?.src ?? "banner"}-${index}`}>{inner}</div>
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
        <div className="w-full bg-ink py-6" dir="rtl">
          <LogoLoop
            className="max-w-full"
            speed={40}
            items={p.items.map((it, i) => (
              <span key={i} className="flex items-center gap-3 text-sm font-bold text-white/60">
                <span aria-hidden className="h-1 w-1 rounded-[30px] bg-flame-500" />
                {it.title}
              </span>
            ))}
          />
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
              <AnimatedContent key={i} delay={i * 120} distance={28}>
                <div className="h-full rounded-card bg-plaster p-6">
                  <p className="text-sm leading-7 text-ink">«{t.quote}»</p>
                  <div className="mt-4 text-xs font-semibold text-ash">{t.author}{t.role ? ` · ${t.role}` : ""}</div>
                </div>
              </AnimatedContent>
            ))}
          </div>
        </Section>
      );
    }

    case "imageTextSplit": {
      const p = props as ComponentProps["imageTextSplit"];
      const img = p.image;
      return (
        <Section id={p.anchorId}>
          <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
            <div className={`relative aspect-[4/3] overflow-hidden rounded-card bg-plaster ${p.imageSide === "RIGHT" ? "md:order-2" : ""}`}>
              <Image src={img.src} alt={img.alt ?? ""} fill sizes="(max-width:768px) 100vw, 50vw" className="object-contain p-5 mix-blend-multiply" />
            </div>
            <div className={p.imageSide === "RIGHT" ? "md:order-1" : ""}>
              <h3 className="font-display text-3xl font-extrabold leading-tight text-ink">{p.title}</h3>
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
          <div className="mx-auto max-w-3xl leading-9 text-ink [&_a]:text-flame-700 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-black [&_p]:mb-4" dangerouslySetInnerHTML={{ __html: sanitizeAdminHtml(p.html) }} />
        </Section>
      );
    }

    case "newsletter": {
      const p = props as ComponentProps["newsletter"];
      return (
        <Section>
          {p.title && <SectionHeader title={p.title} />}
          {p.subtitle && <p className="mb-6 -mt-4 text-center text-sm text-ash">{p.subtitle}</p>}
          <NewsletterForm />
        </Section>
      );
    }

    case "countdown": {
      const p = props as ComponentProps["countdown"];
      const link = data.link ?? null;
      return (
        <Section>
          <CountdownTimer endsAt={p.endsAt} linkHref={link?.href} />
        </Section>
      );
    }

    case "blogTeaser": {
      const p = props as ComponentProps["blogTeaser"];
      const posts = data.posts ?? [];
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
      const table = data.comparison;
      // Fewer than two published columns is not a comparison. The client's own query dropped the
      // block in that case and the gateway applies the same rule, so the outcome does not change.
      if (!table || table.products.length < 2) return null;
      return (
        <Section>
          {p.title && <SectionHeader title={p.title} />}
          <div className="overflow-x-auto rounded-card border border-plaster">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-plaster text-right">
                  <th className="px-4 py-3 font-semibold text-ash">ویژگی</th>
                  {table.products.map((pr) => (
                    <th key={pr.id} className="px-4 py-3 font-semibold text-ink">{pr.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-plaster">
                {table.fields.map((field) => (
                  <tr key={field.name}>
                    <td className="px-4 py-2.5 text-ash">{field.name}</td>
                    {field.values.map((value, index) => (
                      <td key={table.products[index].id} className="px-4 py-2.5 text-ink">{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      );
    }

    case "statsRow": {
      const p = props as ComponentProps["statsRow"];
      return (
        <Section id={p.anchorId}>
          <div className="grid gap-px overflow-hidden rounded-card bg-fog/70 sm:grid-cols-2 lg:grid-cols-4">
            {p.items.map((item, index) => (
              <div key={`${item.value}-${item.label}-${index}`} className="bg-plaster/70 p-6 text-center">
                <div className="font-display text-3xl font-black tabular-nums text-ink">{item.value}</div>
                <div className="mt-2 text-sm text-ash">{item.label}</div>
              </div>
            ))}
          </div>
        </Section>
      );
    }

    case "slidingStrip": {
      const p = props as ComponentProps["slidingStrip"];
      const speed = p.speed === "slow" ? 24 : p.speed === "fast" ? 64 : 40;
      return (
        <div className="overflow-hidden border-y border-plaster bg-ink py-5" aria-label={p.items.join("، ")}>
          <LogoLoop speed={speed} items={p.items.map((item) => <span key={item} className="text-sm font-bold text-white/70">{item}</span>)} />
        </div>
      );
    }

    case "beforeAfter": {
      const p = props as ComponentProps["beforeAfter"];
      const [beforeLink, afterLink] = data.pairLinks ?? [];
      const pair = [
        { image: p.before, link: beforeLink, label: "قبل" },
        { image: p.after, link: afterLink, label: "بعد" },
      ];
      return (
        <Section id={p.anchorId}>
          <div className="grid gap-4 md:grid-cols-2">
            {pair.map(({ image, link, label }) => {
              const content = <div className="group relative aspect-[4/3] overflow-hidden rounded-card bg-plaster"><Image src={image.src} alt={image.alt ?? label} fill sizes="(max-width:768px) 100vw, 50vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transform-none" /><span className="absolute bottom-4 right-4 rounded-card bg-ink/85 px-3 py-1.5 text-xs font-bold text-white">{label}</span></div>;
              return link ? <Link key={label} href={link.href} target={link.newTab ? "_blank" : undefined} rel={link.newTab ? "noopener noreferrer" : undefined}>{content}</Link> : <div key={label}>{content}</div>;
            })}
          </div>
        </Section>
      );
    }

    case "map": {
      const p = props as ComponentProps["map"];
      return (
        <Section id={p.anchorId}>
          {p.title && <SectionHeader title={p.title} />}
          <div className="mx-auto aspect-[16/7] max-w-5xl overflow-hidden rounded-card bg-plaster">
            <iframe src={p.embedUrl} title={p.title ?? "نقشه"} loading="lazy" className="h-full w-full" />
          </div>
        </Section>
      );
    }

    case "customHtml": {
      const p = props as ComponentProps["customHtml"];
      return <Section id={p.anchorId}><div className="mx-auto max-w-3xl leading-8 text-ink" dangerouslySetInnerHTML={{ __html: sanitizeAdminHtml(p.html) }} /></Section>;
    }

    case "spacer":
      return <div style={{ height: (props as ComponentProps["spacer"]).height ?? 48 }} aria-hidden />;

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
    /* ---------- Trust badges: icon + Persian label strip on plaster ---------- */
    case "trustBadges": {
      const p = props as ComponentProps["trustBadges"];
      const icons: Record<string, React.ReactNode> = {
        truck: <path d="M13 16V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10h2m8 0h4m-4 0h-4m9 0h2v-4l-3-4h-3m1 8a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M6 16.5a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0" />,
        shield: <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />,
        "credit-card": <><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M2.5 10h19M6 15h4" /></>,
        headset: <path d="M4 13a8 8 0 0 1 16 0m-16 0v3a2 2 0 0 0 2 2h1v-5H5a1 1 0 0 0-1 1zm16 0v3a2 2 0 0 1-2 2h-1v-5h2a1 1 0 0 1 1 1z" />,
      };
      return (
        <div className="w-full border-y border-plaster bg-canvas">
          <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-6 px-4 py-10 md:grid-cols-4">
            {p.items.map((it, i) => (
              <AnimatedContent key={i} delay={i * 90} distance={20}>
                <div className="flex items-center justify-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-[30px] bg-plaster text-ink">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      {icons[it.icon ?? ""] ?? icons.shield}
                    </svg>
                  </span>
                  <span className="text-sm font-bold text-ink">{it.label}</span>
                </div>
              </AnimatedContent>
            ))}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

export default function BlockRenderer({ blocks }: { blocks: ResolvedBlock[] }) {
  const visible = blocks.filter((b) => (b.props as { visible?: boolean })?.visible !== false);
  return (
    <div className="min-h-screen bg-canvas">
      {visible.map((b) => (
        <BlockNode key={b.id} block={b} />
      ))}
    </div>
  );
}

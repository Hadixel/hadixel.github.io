import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from "react";

type HeroLink = {
  href: string;
  label: string;
  newTab?: boolean;
};

export function HomeHero({
  title,
  subtitle,
  cta,
  image,
}: {
  title: string;
  subtitle?: string;
  cta?: HeroLink | null;
  image?: { src: string | null; alt: string };
}) {
  const words = title.trim().split(/\s+/).filter(Boolean);

  return (
    <div className="home-hero-track">
      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero-grid">
          <div className="home-hero-copy">
            <h1 id="home-hero-title" className="home-hero-title">
              {words.map((word, index) => (
                <span
                  key={`${word}-${index}`}
                  className="home-hero-word"
                  style={{ "--word-index": index } as CSSProperties}
                >
                  {word}
                  {index < words.length - 1 ? " " : ""}
                </span>
              ))}
            </h1>
            {subtitle && <p className="home-hero-subtitle">{subtitle}</p>}
            <div className="home-hero-actions">
              {cta && (
                <Link href={cta.href} target={cta.newTab ? "_blank" : undefined} rel={cta.newTab ? "noopener noreferrer" : undefined} className="home-hero-primary">
                  {cta.label}
                </Link>
              )}
              <Link href="/products" className="home-hero-secondary">
                خرید بر اساس دسته‌بندی
              </Link>
            </div>
          </div>

          <div className="home-hero-stage" aria-hidden="true">
            <div className="home-hero-glow" />
            <svg className="home-hero-ring" viewBox="0 0 400 400" fill="none">
              <circle className="home-hero-track-line" cx="200" cy="200" r="170" />
              <circle className="home-hero-dial" cx="200" cy="200" r="148" />
              <path className="home-hero-arc" pathLength="100" d="M 200 30 A 170 170 0 1 1 199.99 30" />
              <circle className="home-hero-spark" cx="200" cy="30" r="7" />
            </svg>
            {image?.src ? (
              <div className="home-hero-product">
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  preload
                  sizes="(max-width: 767px) 78vw, 46vw"
                  className="object-contain mix-blend-multiply"
                />
              </div>
            ) : (
              <div className="home-hero-placeholder" />
            )}
          </div>
        </div>
        <div className="home-hero-cue" aria-hidden="true">
          <span>ادامه</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </section>
    </div>
  );
}

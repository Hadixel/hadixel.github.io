"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StarBorder } from "@kmodern/ui";

type HeroLink = {
  href: string;
  label: string;
  newTab?: boolean;
};

/*
 * «شعله» v3 — type + authored flame geometry.
 *
 * The hero is typography on a dark ink panel, backed by geometry this file
 * owns: a blue radial glow and three ember rings drawn as inline SVG strokes.
 * No product photography, no raster cut-outs, no image bytes at all — the
 * headline is the image, and the rings are the flame it burns on.
 *
 * Everything is server-rendered final-state; the word and ring animations run
 * once on load and only when the shopper accepts motion. The only JS is the
 * scroll-cue fade. Persian headline animates word-level.
 */

export function HomeHero({
  title,
  subtitle,
  cta,
}: {
  title: string;
  subtitle?: string;
  cta?: HeroLink | null;
}) {
  const [cueGone, setCueGone] = useState(false);

  useEffect(() => {
    const onScroll = () => setCueGone(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <section className="home-hero" aria-labelledby="home-hero-title">
      {/* Authored geometry, not photography: an ember ring system behind the
          headline. Crisp vector strokes + a light gradient — no raster bytes,
          no product cut-outs. */}
      <div className="home-hero-aurora" aria-hidden="true">
        <div className="home-hero-glow" />
        <svg className="home-hero-rings" viewBox="0 0 640 640" fill="none" focusable="false">
          <defs>
            <linearGradient id="hero-ember" x1="0" y1="0" x2="1" y2="1">
              {/* `stop-color` is the property that paints a gradient stop; `fill` does not. The
                  earlier `className="fill-flame-*"` form compiled and built, and rendered black —
                  verified by rasterising both forms in a browser before choosing this one. */}
              <stop offset="0" style={{ stopColor: "var(--color-flame-600)" }} />
              <stop offset="0.55" style={{ stopColor: "var(--color-flame-500)" }} />
              <stop offset="1" style={{ stopColor: "var(--color-flame-400)" }} stopOpacity="0" />
            </linearGradient>
          </defs>
          <circle className="home-hero-ring-outer" cx="320" cy="320" r="248" stroke="url(#hero-ember)" />
          <path className="home-hero-ring-mid" d="M 122 320 A 198 198 0 0 1 518 320" stroke="url(#hero-ember)" />
          <circle className="home-hero-ring-inner" cx="320" cy="320" r="108" stroke="url(#hero-ember)" />
        </svg>
        <div className="home-hero-horizon" />
      </div>

      {/* ---------- Copy ---------- */}
      <div className="home-hero-inner">
        <h1 id="home-hero-title" className="home-hero-title">
          <span className="sr-only">{title}</span>
          {title.split(" ").map((word, i) => (
            <span key={`${word}-${i}`} aria-hidden="true" className="home-hero-word" style={{ "--word-i": i } as React.CSSProperties}>
              {word}
            </span>
          ))}
        </h1>

        {subtitle && <p className="home-hero-subtitle">{subtitle}</p>}

        <div className="home-hero-actions">
          {cta && (
            <StarBorder color="var(--color-flame-500)" speed="7s" className="home-hero-primary-glow">
              <Link
                href={cta.href}
                target={cta.newTab ? "_blank" : undefined}
                rel={cta.newTab ? "noopener noreferrer" : undefined}
                className="home-hero-primary"
              >
                {cta.label}
                <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="home-hero-primary-arrow">
                  <path d="M19 12H5" />
                  <path d="m12 19-7-7 7-7" />
                </svg>
              </Link>
            </StarBorder>
          )}
          <Link href="/products" className="home-hero-secondary">
            خرید بر اساس دسته‌بندی
          </Link>
        </div>

        <dl className="home-hero-marks" aria-label="برندهای موجود">
          <div>
            <dt className="sr-only">برند داتیس</dt>
            <dd className="text-code">DATEES</dd>
          </div>
          <div>
            <dt className="sr-only">برند شافل</dt>
            <dd className="text-code">SCHUFFLE</dd>
          </div>
          <div>
            <dt className="sr-only">برند آلتون</dt>
            <dd className="text-code">ALTON</dd>
          </div>
          <div>
            <dt className="sr-only">برند بیمکس</dt>
            <dd className="text-code">BIMAX</dd>
          </div>
        </dl>
      </div>
      <div className="home-hero-cue" aria-hidden="true" data-gone={cueGone || undefined}>
        <span>اسکرول</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      </section>
    </>
  );
}

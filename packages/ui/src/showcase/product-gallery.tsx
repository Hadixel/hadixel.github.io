"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

import { cn } from "../cn";
import { toFaDigits } from "@kmodern/schema";

/*
 * ProductGallery — main image on a plaster plinth, thumbnail rail
 * (vertical beside the main image on desktop, horizontal strip on mobile),
 * active frame rings flame blue. Click/tap the main image opens a
 * fullscreen lightbox: arrow/keyboard navigation (RTL-mirrored),
 * click-to-zoom, Esc/backdrop close, Persian counter.
 */
export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    setIndex(0);
  }, [images]);

  const safeIndex = images.length ? Math.min(index, images.length - 1) : 0;
  const count = images.length;

  const close = useCallback(() => { setOpen(false); setZoomed(false); }, []);
  const step = useCallback(
    (dir: 1 | -1) => { setZoomed(false); setIndex((i) => (count ? (i + dir + count) % count : 0)); },
    [count],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      // RTL: ArrowLeft advances (next), ArrowRight goes back
      if (e.key === "ArrowLeft") step(1);
      if (e.key === "ArrowRight") step(-1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close, step]);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
      {/* thumbnail rail — vertical on the start edge (right, RTL) on desktop,
          horizontal strip under the main image on mobile */}
      {count > 1 && (
        <div
          role="tablist"
          aria-label="تصاویر محصول"
          className="order-2 flex flex-row-reverse gap-2 overflow-x-auto pb-1 lg:order-1 lg:w-20 lg:flex-col lg:overflow-y-auto lg:pb-0"
        >
          {images.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === safeIndex}
              onClick={() => setIndex(i)}
              className={cn(
                "relative h-20 w-20 shrink-0 overflow-hidden rounded-card border-2 bg-plaster transition-colors",
                i === safeIndex ? "border-flame-700" : "border-transparent hover:border-fog",
              )}
            >
              <Image src={src} alt={`${alt} ${i + 1}`} fill sizes="80px" className="object-contain p-1" />
            </button>
          ))}
        </div>
      )}

      {/* main plinth — click opens the lightbox */}
      <button
        type="button"
        onClick={() => count > 0 && setOpen(true)}
        aria-label="مشاهده تصویر بزرگتر"
        className="group relative order-1 aspect-square min-w-0 flex-1 cursor-zoom-in overflow-hidden rounded-card bg-plaster lg:order-2"
      >
        {/* white well — frames the photo, whites blend instead of pasting */}
        <div aria-hidden className="absolute inset-4 rounded-[10px] bg-canvas ring-1 ring-fog/40" />
        {count > 0 ? (
          <Image
            src={images[safeIndex]}
            alt={alt}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain p-6 transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="flex aspect-square items-center justify-center text-sm text-slate-line">بدون تصویر</span>
        )}
      </button>

      {open && count > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`گالری تصاویر ${alt}`}
          onClick={close}
          className="fixed inset-0 z-[100] flex flex-col bg-ink/95 backdrop-blur-sm"
        >
          {/* header: counter + close */}
          <div className="flex items-center justify-between px-5 py-4 text-white">
            <span className="text-sm text-white/70">
              {toFaDigits(safeIndex + 1)} / {toFaDigits(count)}
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="بستن"
              autoFocus
              className="flex size-10 items-center justify-center rounded-[30px] bg-white/10 transition hover:bg-white/20"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* stage */}
          <div className="relative flex flex-1 items-center justify-between gap-2 px-2 pb-6 sm:px-6">
            {count > 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); step(-1); }}
                aria-label="تصویر قبلی"
                className="flex size-11 shrink-0 items-center justify-center rounded-[30px] bg-white/10 text-white transition hover:bg-white/20"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <div
              onClick={(e) => { e.stopPropagation(); setZoomed((z) => !z); }}
              className={cn("relative h-full w-full overflow-hidden", zoomed ? "cursor-zoom-out" : "cursor-zoom-in")}
            >
              <Image
                src={images[safeIndex]}
                alt={alt}
                fill
                sizes="100vw"
                className={cn(
                  "object-contain p-2 transition-transform duration-300",
                  zoomed ? "scale-[1.7]" : "scale-100",
                )}
              />
            </div>
            {count > 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); step(1); }}
                aria-label="تصویر بعدی"
                className="flex size-11 shrink-0 items-center justify-center rounded-[30px] bg-white/10 text-white transition hover:bg-white/20"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M8 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

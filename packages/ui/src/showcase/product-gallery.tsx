"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";

import { cn } from "../cn";
import { toFaDigits } from "@kmodern/contracts";
import { ShimmerImage } from "../components/shimmer-image";

/* Zoom affordance — one glyph, reused by the stage chip and the caption action. */
function ZoomGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 12l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 5.5v5M5.5 8h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* Every number is its own flex child: bidi would otherwise reorder a bare
   "۴ / ۱" string and the counter would read backwards on the RTL start edge. */
/* A slash between two Persian numerals is a bidi trap: digits run LTR inside an
   RTL line, so "۲ / ۴" renders as "۴ / ۲" and reads as "frame 4 of 2". A Persian
   word cannot be reordered under the reader. */
function FrameCounter({ index, count, className }: { index: number; count: number; className?: string }) {
  return (
    <span className={cn("flex items-center gap-1 tabular-nums", className)}>
      <span>{toFaDigits(index + 1)}</span>
      <span aria-hidden className="opacity-50">از</span>
      <span>{toFaDigits(count)}</span>
    </span>
  );
}

/*
 * ProductGallery — a square white stage (the aspect the catalog product shots
 * are authored at) on a hairline card, width-capped so it can never outgrow the
 * media column or leave a void beside it. Three deliberate cases: no image →
 * a framed photo-glyph placeholder; one image → the shot alone with a caption
 * action, no rail and no "۱ از ۱" chip; several → the shot plus a thumbnail
 * tab rail and a frame counter. The zoom affordance opens a fullscreen
 * lightbox: RTL-mirrored arrows and arrow keys, click-to-zoom, Esc/backdrop
 * close, Persian counter.
 */
export function ProductGallery({ images, alt, initialImage, initialIndex, className }: {
  images: string[];
  alt: string;
  initialImage?: string;
  initialIndex?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const galleryId = useId().replace(/:/g, "");
  const panelId = `${galleryId}-panel`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasMountedRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // Re-sync when the selected variant changes (its shot becomes the stage if present);
  // Never cycle through arbitrary angles of a shared shot!
  useEffect(() => {
    if (initialImage) {
      const i = images.indexOf(initialImage);
      if (i >= 0) {
        setIndex(i);
        return;
      }
    }
    if (typeof initialIndex === "number" && initialIndex >= 0 && initialIndex < images.length) {
      setIndex(initialIndex);
    }
  }, [initialImage, initialIndex, images]);

  const safeIndex = images.length ? Math.min(index, images.length - 1) : 0;
  const count = images.length;

  // Keep the active thumbnail centered in the horizontal strip without scrolling
  // the outer page vertically (and skip on initial mount).
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    const strip = tabListRef.current;
    const tab = tabRefs.current[safeIndex];
    if (!strip || !tab || typeof strip.scrollTo !== "function") return;
    const stripRect = strip.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const deltaX = tabRect.left + tabRect.width / 2 - (stripRect.left + stripRect.width / 2);
    if (Math.abs(deltaX) < 1) return;
    strip.scrollTo({
      left: strip.scrollLeft + deltaX,
      behavior: "smooth",
    });
  }, [safeIndex]);

  const close = useCallback(() => { setOpen(false); setZoomed(false); }, []);
  const step = useCallback(
    (dir: 1 | -1) => { setZoomed(false); setIndex((i) => (count ? (i + dir + count) % count : 0)); },
    [count],
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent, onShortTap?: () => void) => {
    if (!touchStartRef.current) return;
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const deltaTime = Date.now() - start.time;

    // Horizontal swipe: threshold 35px, horizontal dominance
    if (Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      if (count > 1) {
        // Persian RTL: Swipe left (deltaX < 0) advances to next image (step(1))
        // Swipe right (deltaX > 0) goes back to previous image (step(-1))
        step(deltaX < 0 ? 1 : -1);
      }
    } else if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && deltaTime < 350) {
      onShortTap?.();
    }
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tabIndex: number) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? 1 : -1;
      const nextIndex = (tabIndex + direction + count) % count;
      setIndex(nextIndex);
      tabRefs.current[nextIndex]?.focus();
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0 : count - 1;
      setIndex(nextIndex);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      // RTL: ArrowLeft advances (next), ArrowRight goes back
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        step(-1);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, step]);

  if (count === 0) {
    return (
      <div className={cn("product-gallery", className)}>
        <div className="mx-auto w-full max-w-[560px] rounded-card bg-canvas p-3 shadow-sm ring-1 ring-plaster sm:p-4">
          <div className="flex aspect-square flex-col items-center justify-center gap-3 rounded-card bg-plaster/70 px-6 text-center">
            <svg width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden className="text-ash">
              <rect x="7.5" y="13.5" width="33" height="27" rx="4" stroke="currentColor" strokeWidth="1.6" />
              <path d="M17 13.5 19.8 9h8.4L31 13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="24" cy="27.5" r="6.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M33.5 19.8h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            <p className="max-w-[24ch] text-sm leading-6 text-ash">تصویری برای این محصول ثبت نشده است</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("product-gallery flex flex-col gap-4", className)}>
      <div
        id={panelId}
        role={count > 1 ? "tabpanel" : undefined}
        aria-labelledby={count > 1 ? `${galleryId}-tab-${safeIndex}` : undefined}
        className="min-w-0"
      >
        <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-card bg-canvas shadow-sm ring-1 ring-plaster">
          {/* The whole stage is the zoom control and supports touch swipe:
              swipe left/right advances/rewinds in RTL, while tap opens lightbox. */}
          <div
            className="group relative block aspect-square w-full select-none"
            onTouchStart={handleTouchStart}
            onTouchEnd={(e) => handleTouchEnd(e, () => setOpen(true))}
          >
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="مشاهده تصویر بزرگتر"
              className="relative block h-full w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame-700"
            >
              <ShimmerImage
                key={safeIndex}
                src={images[safeIndex]}
                alt={alt}
                fill
                priority
                loading="eager"
                sizes="(max-width: 640px) 92vw, 560px"
                className="object-contain p-2 transition-all duration-300 group-hover:scale-[1.03] motion-reduce:transform-none sm:p-3"
              />
              {count > 1 && (
                <FrameCounter
                  index={safeIndex}
                  count={count}
                  className="pointer-events-none absolute bottom-4 end-4 rounded-card bg-plaster px-2.5 py-1 text-xs font-semibold text-graphite"
                />
              )}
              {count > 1 && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute bottom-3 start-3 flex size-11 items-center justify-center rounded-pill bg-plaster text-ink transition group-hover:bg-fog"
                >
                  <ZoomGlyph />
                </span>
              )}
            </button>
          </div>
        </div>

        {/* A lone shot needs no counter and no chip row — the caption action is
            the whole secondary layer, centred under the stage. */}
        {count === 1 && (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-card bg-canvas px-4 py-2.5 text-sm font-semibold text-ink shadow-sm ring-1 ring-plaster transition hover:bg-plaster focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame-700"
            >
              <ZoomGlyph />
              مشاهده تصویر بزرگتر
            </button>
          </div>
        )}
      </div>

      {/* RTL filmstrip under the stage: the first frame sits on the start edge
          (the right), so the rail grows away from it as images are added.
          Extra spacing placed here so it sits comfortably beneath the main stage. */}
      {count > 1 && (
        <div className="mx-auto mt-4 w-full max-w-[560px] sm:mt-6">
          <div
            ref={tabListRef}
            role="tablist"
            aria-label="تصاویر محصول"
            aria-orientation="horizontal"
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
          >
            {images.map((src, i) => {
              const active = i === safeIndex;
              return (
                <button
                  key={`${src}-${i}`}
                  ref={(node) => { tabRefs.current[i] = node; }}
                  id={`${galleryId}-tab-${i}`}
                  type="button"
                  role="tab"
                  aria-controls={panelId}
                  aria-label={`${alt}، نمایش تصویر ${toFaDigits(i + 1)} از ${toFaDigits(count)}`}
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => { setIndex(i); setZoomed(false); }}
                  onKeyDown={(event) => handleTabKeyDown(event, i)}
                  className={cn(
                    "relative size-20 shrink-0 overflow-hidden rounded-card border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame-700 sm:size-28",
                    active ? "border-flame-700 ring-2 ring-flame-200" : "border-plaster hover:border-fog",
                  )}
                >
                  <ShimmerImage src={src} alt="" fill sizes="(max-width: 640px) 80px, 112px" className="object-contain p-1" />
                  {/* shape cue beside the hue: the active frame is also marked,
                      so it survives a colour-blind or washed-out read */}
                  {active && <span aria-hidden className="absolute inset-x-2 bottom-1.5 h-1 rounded-full bg-flame-700" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {open && createPortal(
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`گالری تصاویر ${alt}`}
          tabIndex={-1}
          onClick={close}
          className="fixed inset-0 z-[100] flex flex-col bg-canvas lightbox-animate-in"
        >
          {/* header: counter + close */}
          <div className="flex items-center justify-between px-5 py-4 text-ink">
            <FrameCounter index={safeIndex} count={count} className="text-sm text-ash" />
            <button
              ref={closeButtonRef}
              type="button"
              onClick={close}
              aria-label="بستن"
              className="flex size-10 items-center justify-center rounded-pill bg-plaster text-ink transition hover:bg-fog"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* stage with swipe gesture support */}
          <div className="relative flex min-w-0 flex-1 items-center justify-between gap-2 px-2 pb-6 sm:px-6">
            {/* RTL: "previous" is the start-edge (right) control, so its chevron
                points back toward the right; "next" mirrors it on the left. */}
            {count > 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); step(-1); }}
                aria-label="تصویر قبلی"
                className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-plaster text-ink transition hover:bg-fog"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M8 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <div
              className="relative h-full w-full min-w-0 flex-1 select-none"
              onTouchStart={handleTouchStart}
              onTouchEnd={(e) => handleTouchEnd(e, () => setZoomed((value) => !value))}
            >
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); setZoomed((value) => !value); }}
                aria-label={zoomed ? "کوچک‌نمایی تصویر" : "بزرگ‌نمایی تصویر"}
                aria-pressed={zoomed}
                className={cn(
                  "relative h-full w-full min-w-0 flex-1 overflow-hidden text-start",
                  zoomed ? "cursor-zoom-out" : "cursor-zoom-in",
                )}
              >
                <ShimmerImage
                  key={safeIndex}
                  src={images[safeIndex]}
                  alt=""
                  fill
                  sizes="100vw"
                  className={cn(
                    "object-contain p-2 transition-transform duration-300 motion-reduce:transition-none",
                    zoomed ? "[transform:scale(1.7)] motion-reduce:[transform:scale(1)]" : "[transform:scale(1)]",
                  )}
                />
              </button>
            </div>
            {count > 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); step(1); }}
                aria-label="تصویر بعدی"
                className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-plaster text-ink transition hover:bg-fog"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

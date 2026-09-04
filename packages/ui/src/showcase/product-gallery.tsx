"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

import { cn } from "../cn";

/*
 * ProductGallery — main image on a plaster plinth + thumbnail tabs.
 * Active tab rings flame blue; thumbnails are 10px frames (Zellerfeld
 * carousel-arrow idiom, RTL-mirrored). Images follow the active variant.
 */
export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [images]);

  const safeIndex = images.length ? Math.min(index, images.length - 1) : 0;

  return (
    <div className="grid gap-3">
      <div className="relative aspect-square overflow-hidden rounded-card bg-plaster">
        {images.length > 0 ? (
          <Image
            src={images[safeIndex]}
            alt={alt}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain p-6"
          />
        ) : (
          <div className="flex aspect-square items-center justify-center text-sm text-slate-line">بدون تصویر</div>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex flex-row-reverse flex-wrap gap-2" role="tablist" aria-label="تصاویر محصول">
          {images.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === safeIndex}
              onClick={() => setIndex(i)}
              className={cn(
                "relative h-20 w-20 overflow-hidden rounded-card border-2 bg-plaster transition-colors",
                i === safeIndex ? "border-flame-700" : "border-transparent hover:border-fog",
              )}
            >
              <Image src={src} alt={`${alt} ${i + 1}`} fill sizes="80px" className="object-contain p-1" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

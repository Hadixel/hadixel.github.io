"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image, { type ImageProps } from "next/image";
import { cn } from "../cn";

export const shimmerSvg = (w = 400, h = 400) => `
<svg width="${w}" height="${h}" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="g">
      <stop stop-color="#ecedee" offset="20%" />
      <stop stop-color="#f5f5f6" offset="50%" />
      <stop stop-color="#ecedee" offset="70%" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#ecedee" />
  <rect id="r" width="${w}" height="${h}" fill="url(#g)" />
</svg>`;

export const toBase64 = (str: string) =>
  typeof window === "undefined"
    ? Buffer.from(str).toString("base64")
    : window.btoa(str);

export const shimmerBlurDataUrl = (w = 40, h = 40) =>
  `data:image/svg+xml;base64,${toBase64(shimmerSvg(w, h))}`;

export function AppliancePlaceholder({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("size-10 sm:size-12 text-ash/40", className)}
    >
      {/* Sleek minimalist appliance chassis */}
      <rect x="8" y="7" width="32" height="34" rx="5" stroke="currentColor" strokeWidth="1.75" />
      {/* Control panel separator */}
      <line x1="8" y1="16" x2="40" y2="16" stroke="currentColor" strokeWidth="1.75" />
      {/* Dials / indicators */}
      <circle cx="14" cy="11.5" r="1.5" fill="currentColor" />
      <circle cx="20" cy="11.5" r="1.5" fill="currentColor" />
      <circle cx="26" cy="11.5" r="1.5" fill="currentColor" />
      <circle cx="34" cy="11.5" r="1.2" fill="currentColor" />
      {/* Chamber / Door window */}
      <rect x="13" y="21" width="22" height="15" rx="3" stroke="currentColor" strokeWidth="1.5" />
      {/* Appliance handle */}
      <line x1="18" y1="18.5" x2="30" y2="18.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      {/* Interior rack line */}
      <line x1="17" y1="28.5" x2="31" y2="28.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 3" opacity="0.7" />
    </svg>
  );
}

export function ImagePlaceholder({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex h-full w-full select-none items-center justify-center bg-plaster/40",
        className,
      )}
    >
      <AppliancePlaceholder className={iconClassName} />
    </div>
  );
}

export interface ShimmerImageProps extends Omit<ImageProps, "placeholder" | "blurDataURL"> {
  placeholder?: ImageProps["placeholder"];
  blurDataURL?: string;
  wrapperClassName?: string;
  showShimmer?: boolean;
  shimmerClassName?: string;
  fallback?: React.ReactNode;
  fallbackClassName?: string;
}

export function ShimmerImage({
  className,
  wrapperClassName,
  onLoad,
  onError,
  showShimmer = true,
  shimmerClassName,
  placeholder = "empty",
  blurDataURL,
  fill,
  alt = "",
  fallback,
  fallbackClassName,
  ...props
}: ShimmerImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const prevSrcRef = useRef(props.src);

  // Synchronous check if image is already cached/complete
  const handleRef = useCallback((node: HTMLImageElement | null) => {
    imgRef.current = node;
    if (node?.complete && node.naturalWidth > 0) {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (prevSrcRef.current !== props.src) {
      prevSrcRef.current = props.src;
      setHasError(false);
      if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
        setIsLoaded(true);
      } else {
        setIsLoaded(false);
      }
    }
  }, [props.src]);

  const defaultBlur = blurDataURL ?? (placeholder === "blur" ? shimmerBlurDataUrl(40, 40) : undefined);
  const hasValidSrc = Boolean(props.src);

  // The placeholder is ALWAYS rendered immediately in the DOM from SSR (0ms delay).
  // It fades out once the actual image finishes downloading and rendering.
  const placeholderElement = (
    <div
      aria-hidden="true"
      className={cn(
        fill ? "absolute inset-0 flex" : "flex h-full w-full",
        "pointer-events-none select-none items-center justify-center transition-opacity duration-300",
        isLoaded && !hasError ? "opacity-0" : "opacity-100",
        fallbackClassName,
      )}
    >
      {fallback ?? <AppliancePlaceholder className="size-10 sm:size-12 text-ash/35" />}
    </div>
  );

  const shimmerElement = showShimmer && hasValidSrc && !hasError && (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-0 overflow-hidden transition-opacity duration-300",
        isLoaded ? "opacity-0" : "opacity-100",
        shimmerClassName,
      )}
    >
      <span className="absolute inset-0 -translate-x-full animate-shimmer-sweep bg-gradient-to-r from-transparent via-white/50 to-transparent motion-reduce:animate-none" />
    </span>
  );

  const imageElement = hasValidSrc && !hasError && (
    <Image
      ref={handleRef}
      {...props}
      alt={alt}
      fill={fill}
      placeholder={placeholder}
      blurDataURL={defaultBlur}
      onLoad={(e) => {
        setIsLoaded(true);
        onLoad?.(e);
      }}
      onError={(e) => {
        setHasError(true);
        setIsLoaded(false);
        onError?.(e);
      }}
      className={cn(
        "relative z-1 opacity-100",
        className,
      )}
    />
  );

  if (fill) {
    return (
      <>
        {placeholderElement}
        {shimmerElement}
        {imageElement}
      </>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", wrapperClassName)}>
      {placeholderElement}
      {shimmerElement}
      {imageElement}
    </div>
  );
}

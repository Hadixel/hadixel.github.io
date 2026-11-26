"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function normalizePathname(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

/**
 * Resets window scroll to the top on forward client-side route transitions.
 *
 * Next.js App Router can skip its built-in scroll-to-top when a sticky header
 * sits above `<main>` and `overflow-x: clip` is applied on html/body. Only
 * pathname changes reset scroll — initial mount, query-param updates, hash
 * anchors, and browser back/forward history (`popstate`) are preserved.
 */
export function ScrollToTop() {
  const pathname = usePathname() ?? "";
  const normalizedPathname = normalizePathname(pathname);
  const prevPathnameRef = useRef(normalizedPathname);
  const popStatePathRef = useRef<string | null>(null);

  useEffect(() => {
    const onPopState = () => {
      const targetPath = normalizePathname(window.location.pathname);
      if (targetPath !== prevPathnameRef.current) {
        popStatePathRef.current = targetPath;
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (prevPathnameRef.current === normalizedPathname) {
      return;
    }
    prevPathnameRef.current = normalizedPathname;

    if (popStatePathRef.current === normalizedPathname) {
      popStatePathRef.current = null;
      return;
    }
    popStatePathRef.current = null;

    if (!window.location.hash) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      document.documentElement.scrollTop = 0;
    }
  }, [normalizedPathname]);

  return null;
}
